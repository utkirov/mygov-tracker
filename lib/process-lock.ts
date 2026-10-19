import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * PID-file lock: succeeds when the file is missing, stale (process gone) or
 * already ours. Used so two servers on the same data folder never both poll
 * the Telegram bot (Telegram answers 409 to the second getUpdates).
 */
export function acquireProcessLock(file: string, pid = process.pid, isAlive = defaultIsAlive): { ok: true } | { ok: false; holder: number } {
  if (existsSync(file)) {
    const holder = Number(readFileSync(file, 'utf8').trim());
    if (holder && holder !== pid && isAlive(holder)) return { ok: false, holder };
  }
  writeFileSync(file, String(pid));
  return { ok: true };
}

export function releaseProcessLock(file: string, pid = process.pid): void {
  try {
    if (Number(readFileSync(file, 'utf8').trim()) === pid) unlinkSync(file);
  } catch {
    // already gone
  }
}
