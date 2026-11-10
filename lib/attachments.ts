/**
 * Files attached to the application on the my.gov status page («Форма
 * заявления»: акт, декларация, кадастровый паспорт, проект…). Each one is a
 * «Скачать» link in a th/td row — `/ru/get-service-file/<number>/<id>` on the
 * portal (served without a session, always as a zip) or a direct PDF on
 * another government host. The list is refreshed on every check; a file is
 * fetched from the portal the first time someone opens it and then kept in
 *   data/artifacts/<applicationId>/attachments/<key>.<ext>
 * A zip holding a single file is unpacked, so the phone opens the PDF itself.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

import * as cheerio from 'cheerio';

import { getArtifactsRootDir } from './application-artifacts';

export interface AttachmentRef {
  /** Stable id: the portal's file id, or a hash of the URL for other hosts. */
  key: string;
  label: string;
  /** Timeline block the file was found in, e.g. «Форма заявления». */
  stage: string;
  url: string;
}

export interface AttachmentFile { name: string; mime: string; size: number; saved_at: string }
export interface Attachment extends AttachmentRef { file: AttachmentFile | null }

interface Stored { parsed_at: string; items: AttachmentRef[]; files: Record<string, AttachmentFile & { path: string }> }

const KEY_PATTERN = /^[\w-]{1,64}$/;
const APPLICATION_ID_PATTERN = /^[\w-]{1,64}$/;
/** Links that need the applicant's own login (payment receipts) are left out. */
const DOWNLOAD_LINK = /get-service-file|download-conclusion-file|\/download-file|file\/download/i;
const NEEDS_LOGIN = /download-invoice/i;
const MAX_BYTES = 100 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: 'application/pdf', zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'application/acad', txt: 'text/plain',
};

const clean = (s: string) => s.replace(/[\s ]+/g, ' ').trim();

export function parseAttachments(html: string, origin: string): AttachmentRef[] {
  const $ = cheerio.load(html);
  const out = new Map<string, AttachmentRef>();
  $('.timeLineViewBox table tr').each((_, tr) => {
    const href = $(tr).children('td').find('a[href]').first().attr('href') ?? '';
    if (!DOWNLOAD_LINK.test(href) || NEEDS_LOGIN.test(href)) return;
    let url: string;
    try { url = new URL(href, origin).toString(); } catch { return; }
    const portalId = url.match(/get-service-file\/\d+\/([\w-]+)/)?.[1];
    const key = portalId && KEY_PATTERN.test(portalId) ? portalId : createHash('sha1').update(url).digest('hex').slice(0, 16);
    if (out.has(key)) return;
    const stage = clean($(tr).closest('.timeLineViewBox').find('.timeLineViewBoxTitleBox p').first().text());
    out.set(key, { key, label: clean($(tr).children('th').first().text()) || 'Файл', stage, url });
  });
  return [...out.values()];
}

/** The single file inside a zip, or null when it holds several (or isn't a zip we can read). */
export function unzipSingle(zip: Buffer): { name: string; data: Buffer } | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > zip.length) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const files: Array<{ name: string; method: number; compSize: number; offset: number }> = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) return null;
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    if (!name.endsWith('/')) files.push({ name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (files.length !== 1) return null;
  const f = files[0];
  if (f.offset + 30 > zip.length || zip.readUInt32LE(f.offset) !== 0x04034b50) return null;
  const start = f.offset + 30 + zip.readUInt16LE(f.offset + 26) + zip.readUInt16LE(f.offset + 28);
  const raw = zip.subarray(start, start + f.compSize);
  if (f.method === 0) return { name: path.basename(f.name), data: Buffer.from(raw) };
  if (f.method === 8) return { name: path.basename(f.name), data: inflateRawSync(raw) };
  return null;
}

function dirOf(applicationId: string): string | null {
  return APPLICATION_ID_PATTERN.test(applicationId) ? path.join(getArtifactsRootDir(), applicationId) : null;
}

async function readStored(applicationId: string): Promise<Stored | null> {
  const dir = dirOf(applicationId);
  if (!dir) return null;
  try {
    return JSON.parse(await readFile(path.join(dir, 'attachments.json'), 'utf8')) as Stored;
  } catch {
    return null;
  }
}

async function writeStored(applicationId: string, stored: Stored): Promise<void> {
  const dir = dirOf(applicationId);
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'attachments.json'), JSON.stringify(stored, null, 2), 'utf8');
}

const publicFile = ({ name, mime, size, saved_at }: AttachmentFile) => ({ name, mime, size, saved_at });

/** null until the first check (or refresh) after this feature saw the page. */
export async function readAttachments(applicationId: string): Promise<Attachment[] | null> {
  const stored = await readStored(applicationId);
  if (!stored) return null;
  return stored.items.map(item => ({ ...item, file: stored.files[item.key] ? publicFile(stored.files[item.key]) : null }));
}

/** Stores the list from a fresh page; cached files of attachments that vanished are removed. */
export async function saveAttachmentList(applicationId: string, items: AttachmentRef[], now = new Date()): Promise<void> {
  const dir = dirOf(applicationId);
  if (!dir) return;
  const previous = await readStored(applicationId);
  const keys = new Set(items.map(i => i.key));
  const files: Stored['files'] = {};
  for (const [key, file] of Object.entries(previous?.files ?? {})) {
    if (keys.has(key)) files[key] = file;
    else await rm(path.join(dir, 'attachments', file.path), { force: true });
  }
  await writeStored(applicationId, { parsed_at: now.toISOString(), items, files });
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').slice(0, 120).trim();
const extOf = (name: string) => (path.extname(name).slice(1).toLowerCase() || 'bin');

function nameFromDisposition(header: string | null): string {
  if (!header) return '';
  const star = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (star) { try { return decodeURIComponent(star); } catch { /* fall through */ } }
  return header.match(/filename="?([^";]+)"?/i)?.[1] ?? '';
}

/**
 * The file on disk, downloading it from the portal first if needed. Throws a
 * readable message when the portal doesn't give it out.
 */
export async function getAttachmentFile(
  applicationId: string, key: string, applicationNumber: string,
): Promise<{ info: AttachmentFile; data: Buffer }> {
  const dir = dirOf(applicationId);
  const stored = await readStored(applicationId);
  const item = stored?.items.find(i => i.key === key);
  if (!dir || !stored || !item || !KEY_PATTERN.test(key)) throw new Error('Файл не найден');

  const cached = stored.files[key];
  if (cached) {
    try {
      return { info: publicFile(cached), data: await readFile(path.join(dir, 'attachments', cached.path)) };
    } catch { /* deleted by hand — download again */ }
  }

  let response: Response;
  try {
    response = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: '*/*',
        Referer: new URL(item.url).origin + '/',
      },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error('my.gov.uz не ответил — попробуйте позже');
  }
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!response.ok || type.includes('text/html') || type.includes('json')) {
    throw new Error(`Портал не отдал файл (${response.status})`);
  }
  let data: Buffer = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_BYTES) throw new Error('Файл больше 100 МБ');

  let original = nameFromDisposition(response.headers.get('content-disposition')) || path.basename(new URL(item.url).pathname);
  const isZip = data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (isZip) {
    const single = unzipSingle(data);
    if (single) { data = single.data; original = single.name; } else original = 'file.zip';
  }
  const ext = isZip && original === 'file.zip' ? 'zip' : extOf(original);
  const info: AttachmentFile = {
    name: `${safeName(item.label) || 'Файл'} ${applicationNumber}.${ext}`,
    mime: MIME[ext] ?? 'application/octet-stream',
    size: data.length,
    saved_at: new Date().toISOString(),
  };
  const fileName = `${key}.${ext}`;
  await mkdir(path.join(dir, 'attachments'), { recursive: true });
  await writeFile(path.join(dir, 'attachments', fileName), data);

  const latest = (await readStored(applicationId)) ?? stored;
  latest.files[key] = { ...info, path: fileName };
  await writeStored(applicationId, latest);
  return { info, data };
}

