import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { resolveLocalProjectRoot } from './local-paths';
import { getPdfStorageDir } from './local-storage';
import { openDb } from './sqlite-db';

/*
 * Backup file layout (".mgbk"):
 *   "MGBKENC1" | iv (12) | auth tag (16) | AES-256-GCM( gzip( container ) )
 * container:
 *   uint32 BE header length | header JSON | file bytes concatenated in header order
 * header: { version, createdAt, files: [{ name, size, sha256 }] }
 */
const MAGIC = Buffer.from('MGBKENC1', 'ascii');
const FILE_PREFIX = 'mygov-backup-';
const FILE_EXT = '.mgbk';
const DEFAULT_DRIVE_DIRS = ['G:\\Мой диск\\mygov-backup', 'G:\\My Drive\\mygov-backup'];

export const KEEP_DAILY = 14;
export const KEEP_WEEKLY = 8;

export interface BackupFileEntry {
  name: string;
  size: number;
  sha256: string;
}

export interface BackupHeader {
  version: 1;
  createdAt: string;
  files: BackupFileEntry[];
}

export interface BackupStatus {
  dir: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFile: string | null;
  lastSize: number | null;
  lastError: string | null;
}

function envFilePath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), '.env.local');
}

/** Same pattern as ensureAppToken(): generate once, persist to .env.local (gitignored). */
export function ensureBackupKey(rootPath?: string): Buffer {
  const fromEnv = process.env.BACKUP_KEY?.trim();
  if (fromEnv) return parseKey(fromEnv);

  const file = envFilePath(rootPath);
  const contents = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = contents.match(/^BACKUP_KEY=(.*)$/m);
  const value = line ? line[1].trim() : randomBytes(32).toString('hex');

  if (!line) {
    const prefix = contents.length > 0 && !contents.endsWith('\n') ? '\n' : '';
    appendFileSync(file, `${prefix}BACKUP_KEY=${value}\n`, 'utf8');
  }

  process.env.BACKUP_KEY = value;
  return parseKey(value);
}

function parseKey(hex: string): Buffer {
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 64 hex characters');
  return key;
}

export function resolveBackupDir(rootPath?: string): string {
  const configured = process.env.BACKUP_DIR?.trim();
  if (configured) return configured;
  for (const dir of DEFAULT_DRIVE_DIRS) {
    if (existsSync(path.dirname(dir))) return dir;
  }
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'backups');
}

function statusPath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'backup-status.json');
}

export async function readBackupStatus(rootPath?: string): Promise<BackupStatus> {
  const empty: BackupStatus = {
    dir: resolveBackupDir(rootPath),
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFile: null,
    lastSize: null,
    lastError: null,
  };
  try {
    return { ...empty, ...JSON.parse(await readFile(statusPath(rootPath), 'utf8')), dir: empty.dir };
  } catch {
    return empty;
  }
}

async function writeBackupStatus(status: BackupStatus, rootPath?: string): Promise<void> {
  const file = statusPath(rootPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(status, null, 2), 'utf8');
}

export function encryptBackup(files: Array<{ name: string; data: Buffer }>, key: Buffer, createdAt = new Date()): Buffer {
  const header: BackupHeader = {
    version: 1,
    createdAt: createdAt.toISOString(),
    files: files.map(({ name, data }) => ({
      name,
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    })),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(headerBytes.length);
  const container = gzipSync(Buffer.concat([length, headerBytes, ...files.map((f) => f.data)]));

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(container), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBackup(blob: Buffer, key: Buffer): { header: BackupHeader; files: Array<{ name: string; data: Buffer }> } {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a my.gov tracker backup file');
  const iv = blob.subarray(8, 20);
  const tag = blob.subarray(20, 36);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const container = gunzipSync(Buffer.concat([decipher.update(blob.subarray(36)), decipher.final()]));

  const headerLength = container.readUInt32BE(0);
  const header = JSON.parse(container.subarray(4, 4 + headerLength).toString('utf8')) as BackupHeader;
  let offset = 4 + headerLength;
  const files = header.files.map((entry) => {
    const data = container.subarray(offset, offset + entry.size);
    offset += entry.size;
    if (createHash('sha256').update(data).digest('hex') !== entry.sha256) {
      throw new Error(`Checksum mismatch for ${entry.name}`);
    }
    return { name: entry.name, data: Buffer.from(data) };
  });
  return { header, files };
}

function backupFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${FILE_PREFIX}${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${FILE_EXT}`;
}

function parseBackupDate(name: string): Date | null {
  const m = name.match(/^mygov-backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.mgbk$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

/** Newest copy per day for the last KEEP_DAILY days, then newest per ISO week for KEEP_WEEKLY weeks. */
export function selectBackupsToDelete(names: string[], keepDaily = KEEP_DAILY, keepWeekly = KEEP_WEEKLY): string[] {
  const dated = names
    .map((name) => ({ name, date: parseBackupDate(name) }))
    .filter((x): x is { name: string; date: Date } => x.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const keep = new Set<string>();
  const days = new Set<string>();
  for (const { name, date } of dated) {
    const dayKey = date.toDateString();
    if (!days.has(dayKey) && days.size < keepDaily) {
      days.add(dayKey);
      keep.add(name);
    }
  }

  const weeks = new Set<string>();
  for (const { name, date } of dated) {
    if (days.has(date.toDateString())) continue;
    const weekKey = isoWeekKey(date);
    if (!weeks.has(weekKey) && weeks.size < keepWeekly) {
      weeks.add(weekKey);
      keep.add(name);
    }
  }

  return dated.filter((d) => !keep.has(d.name)).map((d) => d.name);
}

let running: Promise<BackupStatus> | null = null;

/** Creates an encrypted backup of the SQLite database and all PDFs. Concurrent calls share one run. */
export function createBackup(rootPath?: string): Promise<BackupStatus> {
  if (!running) running = runBackup(rootPath).finally(() => { running = null; });
  return running;
}

async function runBackup(rootPath?: string): Promise<BackupStatus> {
  const status = await readBackupStatus(rootPath);
  const now = new Date();
  status.lastAttemptAt = now.toISOString();
  const root = resolveLocalProjectRoot(rootPath);
  const snapshot = path.join(root, 'data', `.backup-snapshot-${process.pid}.sqlite`);

  try {
    const key = ensureBackupKey(rootPath);
    const db = await openDb(rootPath);
    await db.backup(snapshot);

    const files: Array<{ name: string; data: Buffer }> = [{ name: 'local-db.sqlite', data: await readFile(snapshot) }];
    const pdfDir = getPdfStorageDir(rootPath);
    if (existsSync(pdfDir)) {
      for (const name of (await readdir(pdfDir)).sort()) {
        if (name.toLowerCase().endsWith('.pdf')) files.push({ name: `pdfs/${name}`, data: await readFile(path.join(pdfDir, name)) });
      }
    }

    const blob = encryptBackup(files, key, now);
    const dir = status.dir;
    await mkdir(dir, { recursive: true });
    const finalName = backupFileName(now);
    const tmp = path.join(dir, `${finalName}.partial`);
    await writeFile(tmp, blob);
    await rename(tmp, path.join(dir, finalName));

    const existing = (await readdir(dir)).filter((n) => n.startsWith(FILE_PREFIX) && n.endsWith(FILE_EXT));
    for (const old of selectBackupsToDelete(existing)) await rm(path.join(dir, old), { force: true });

    Object.assign(status, { lastSuccessAt: now.toISOString(), lastFile: finalName, lastSize: (await stat(path.join(dir, finalName))).size, lastError: null });
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    await rm(snapshot, { force: true });
  }

  await writeBackupStatus(status, rootPath);
  return status;
}
