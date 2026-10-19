/**
 * The Android APK published from Settings → «Приложение Android» (stage 8).
 * Phones compare `versionCode` with their own build and download the file
 * from this server, so updates don't depend on any store:
 *   data/app-release/app.apk       — the published APK
 *   data/app-release/release.json  — version, versionCode, notes, size, sha256
 * A copy also goes next to the backups (Google Drive) as mygov-tracker-<version>.apk.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveBackupDir } from './backup';
import { resolveLocalProjectRoot } from './local-paths';

export const MAX_APK_BYTES = 200 * 1024 * 1024;

export interface AppRelease {
  version: string;
  versionCode: number;
  notes: string;
  size: number;
  sha256: string;
  uploaded_at: string;
  backup_copy: string | null;
}

function releaseDir(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'app-release');
}

export function getApkPath(rootPath?: string): string {
  return path.join(releaseDir(rootPath), 'app.apk');
}

/** APKs are zip archives. */
export function looksLikeApk(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export async function readRelease(rootPath?: string): Promise<AppRelease | null> {
  try {
    return JSON.parse(await readFile(path.join(releaseDir(rootPath), 'release.json'), 'utf8')) as AppRelease;
  } catch {
    return null;
  }
}

export async function publishRelease(
  apk: Buffer,
  meta: { version: string; versionCode: number; notes: string },
  rootPath?: string,
): Promise<AppRelease> {
  const dir = releaseDir(rootPath);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, 'app.apk.partial');
  await writeFile(tmp, apk);
  await rename(tmp, getApkPath(rootPath));

  let backupCopy: string | null = null;
  try {
    const apkDir = path.join(resolveBackupDir(rootPath), 'apk');
    await mkdir(apkDir, { recursive: true });
    backupCopy = path.join(apkDir, `mygov-tracker-${meta.version.replace(/[^\w.-]/g, '_')}.apk`);
    await copyFile(getApkPath(rootPath), backupCopy);
  } catch (err) {
    console.error('[AppRelease] Could not copy the APK next to the backups:', err);
    backupCopy = null;
  }

  const release: AppRelease = {
    version: meta.version,
    versionCode: meta.versionCode,
    notes: meta.notes,
    size: (await stat(getApkPath(rootPath))).size,
    sha256: createHash('sha256').update(apk).digest('hex'),
    uploaded_at: new Date().toISOString(),
    backup_copy: backupCopy,
  };
  await writeFile(path.join(dir, 'release.json'), JSON.stringify(release, null, 2), 'utf8');
  return release;
}
