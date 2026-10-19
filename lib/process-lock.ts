import { existsSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';

/** The holder touches the file this often; a lock untouched for longer than LOCK_STALE_MS is abandoned. */
export const LOCK_HEARTBEAT_MS = 30_000;
export const LOCK_STALE_MS = 90_000;

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * PID-file lock: succeeds when the file is missing, stale or already ours.
 * Stale means the process is gone or the heartbeat stopped — Windows reuses
 * PIDs quickly, so after a hard kill the old PID may belong to an unrelated
 * process. Used so two servers on the same data folder never both poll the
 * Telegram bot (Telegram answers 409 to the second getUpdates).
 */
export function acquireProcessLock(
  file: string,
  pid = process.pid,
  isAlive = defaultIsAlive,
  now = Date.now(),
): { ok: true } | { ok: false; holder: number } {
  if (existsSync(file)) {
    const holder = Number(readFileSync(file, 'utf8').trim());
    const fresh = now - statSync(file).mtimeMs < LOCK_STALE_MS;
    if (holder && holder !== pid && fresh && isAlive(holder)) return { ok: false, holder };
  }
  writeFileSync(file, String(pid));
  return { ok: true };
}

/** Keeps the lock fresh while this process holds it. */
export function startLockHeartbeat(file: string, pid = process.pid): NodeJS.Timeout {
  const timer = setInterval(() => {
    try {
      if (Number(readFileSync(file, 'utf8').trim()) === pid) {
        const t = new Date();
        utimesSync(file, t, t);
      }
    } catch {
      // file removed — the next acquire recreates it
    }
  }, LOCK_HEARTBEAT_MS);
  timer.unref();
  return timer;
}

export function releaseProcessLock(file: string, pid = process.pid): void {
  try {
    if (Number(readFileSync(file, 'utf8').trim()) === pid) unlinkSync(file);
  } catch {
    // already gone
  }
}
