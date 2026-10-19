/**
 * Per-application files produced by status checks, kept on disk so the site
 * and the Android app can show them (previously they only went to Telegram):
 *   data/artifacts/<applicationId>/screenshot.png — latest render of the my.gov page
 *   data/artifacts/<applicationId>/status.pdf     — latest readable status snapshot
 *   data/artifacts/<applicationId>/result-N.pdf   — official result documents
 *   data/artifacts/<applicationId>/meta.json      — timestamps, sizes, document titles
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveLocalProjectRoot } from './local-paths';
import type { RepositoryFileRef } from './repository-files';

export interface ArtifactFileInfo {
  file: string;
  size: number;
  saved_at: string;
}

export interface ResultDocumentInfo extends ArtifactFileInfo {
  title: string;
  state: string;
  pin: string;
}

export interface ApplicationArtifacts {
  screenshot: ArtifactFileInfo | null;
  status_pdf: ArtifactFileInfo | null;
  results: ResultDocumentInfo[];
}

const EMPTY: ApplicationArtifacts = { screenshot: null, status_pdf: null, results: [] };
const APPLICATION_ID_PATTERN = /^[\w-]{1,64}$/;
const FILE_NAME_PATTERN = /^(screenshot\.png|status\.pdf|result-\d{1,2}\.pdf)$/;

export function getArtifactsRootDir(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'artifacts');
}

function artifactDir(applicationId: string, rootPath?: string): string | null {
  if (!APPLICATION_ID_PATTERN.test(applicationId)) return null;
  return path.join(getArtifactsRootDir(rootPath), applicationId);
}

export function isValidArtifactFileName(name: string): boolean {
  return FILE_NAME_PATTERN.test(name);
}

export async function readArtifacts(applicationId: string, rootPath?: string): Promise<ApplicationArtifacts> {
  const dir = artifactDir(applicationId, rootPath);
  if (!dir) return { ...EMPTY, results: [] };
  try {
    const parsed = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')) as Partial<ApplicationArtifacts>;
    return {
      screenshot: parsed.screenshot ?? null,
      status_pdf: parsed.status_pdf ?? null,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
  } catch {
    return { ...EMPTY, results: [] };
  }
}

export async function readArtifactFile(applicationId: string, name: string, rootPath?: string): Promise<Buffer | null> {
  const dir = artifactDir(applicationId, rootPath);
  if (!dir || !isValidArtifactFileName(name)) return null;
  try {
    return await readFile(path.join(dir, name));
  } catch {
    return null;
  }
}

/**
 * Saves whatever the check produced. Missing pieces keep their previous
 * version — a failed screenshot shouldn't wipe the last good one. Result
 * documents replace the previous set only when at least one was downloaded.
 */
export async function saveArtifacts(
  applicationId: string,
  produced: {
    screenshotPng?: Buffer | null;
    statusPdf?: Buffer | null;
    results?: Array<{ ref: RepositoryFileRef; file: Buffer }>;
  },
  rootPath?: string,
): Promise<ApplicationArtifacts> {
  const dir = artifactDir(applicationId, rootPath);
  const current = await readArtifacts(applicationId, rootPath);
  if (!dir) return current;

  const hasResults = (produced.results?.length ?? 0) > 0;
  if (!produced.screenshotPng && !produced.statusPdf && !hasResults) return current;

  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();

  if (produced.screenshotPng) {
    await writeFile(path.join(dir, 'screenshot.png'), produced.screenshotPng);
    current.screenshot = { file: 'screenshot.png', size: produced.screenshotPng.length, saved_at: now };
  }
  if (produced.statusPdf) {
    await writeFile(path.join(dir, 'status.pdf'), produced.statusPdf);
    current.status_pdf = { file: 'status.pdf', size: produced.statusPdf.length, saved_at: now };
  }
  if (hasResults) {
    for (const old of current.results) await rm(path.join(dir, old.file), { force: true });
    current.results = [];
    const results = produced.results!.slice(0, 99);
    for (let i = 0; i < results.length; i++) {
      const { ref, file } = results[i];
      const name = `result-${i + 1}.pdf`;
      await writeFile(path.join(dir, name), file);
      current.results.push({ file: name, size: file.length, saved_at: now, title: ref.title, state: ref.state, pin: ref.pin });
    }
  }

  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(current, null, 2), 'utf8');
  return current;
}

export async function deleteArtifacts(applicationId: string, rootPath?: string): Promise<void> {
  const dir = artifactDir(applicationId, rootPath);
  if (dir) await rm(dir, { recursive: true, force: true });
}
