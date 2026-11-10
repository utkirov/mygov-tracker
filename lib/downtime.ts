/**
 * Downtime of the tracker's own server. The PC cannot report that it is off,
 * so the server leaves a heartbeat every minute (data/heartbeat.json) and, on
 * the next start, compares it with the clock: a gap longer than
 * DOWNTIME_THRESHOLD_MIN is a downtime — logged (data/downtime-log.json, last
 * 50) and reported to Telegram and push. While it lasted, client share links
 * did not open. A rebuild / restart takes 2–3 minutes and stays under the threshold.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const DOWNTIME_THRESHOLD_MIN = 10;
const HEARTBEAT_EVERY_MS = 60_000;

export interface Downtime { from: string; to: string; minutes: number }

const heartbeatPath = (root = process.cwd()) => join(root, 'data', 'heartbeat.json');
const logPath = (root = process.cwd()) => join(root, 'data', 'downtime-log.json');

/** Pure: the gap between the last heartbeat and now, if it is long enough to matter. */
export function detectDowntime(lastHeartbeat: string | null | undefined, now: Date, thresholdMin = DOWNTIME_THRESHOLD_MIN): Downtime | null {
  if (!lastHeartbeat) return null;
  const from = Date.parse(lastHeartbeat);
  if (Number.isNaN(from)) return null;
  const minutes = Math.round((now.getTime() - from) / 60_000);
  return minutes >= thresholdMin ? { from: new Date(from).toISOString(), to: now.toISOString(), minutes } : null;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h} ч ${m} мин` : `${h} ч`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} дн ${h % 24} ч` : `${d} дн`;
}

const clock = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function downtimeMessage(d: Downtime): string {
  return `Трекер был недоступен ${formatDuration(d.minutes)}: с ${clock(d.from)} до ${clock(d.to)}. Проверка заявлений не шла, ссылки клиентов не открывались.`;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function listDowntimes(root?: string): Promise<Downtime[]> {
  const list = await readJson<Downtime[]>(logPath(root), []);
  return Array.isArray(list) ? list : [];
}

async function beat(root?: string): Promise<void> {
  try {
    await mkdir(dirname(heartbeatPath(root)), { recursive: true });
    await writeFile(heartbeatPath(root), JSON.stringify({ at: new Date().toISOString() }), 'utf8');
  } catch (err) {
    console.error('[Downtime] heartbeat failed:', err);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Called once when the server starts: reports the downtime that just ended (if
 * any) through `notify`, then keeps the heartbeat going.
 */
export async function startDowntimeWatch(notify: (d: Downtime) => Promise<void> | void, root?: string, now = new Date()): Promise<Downtime | null> {
  const last = await readJson<{ at?: string }>(heartbeatPath(root), {});
  const downtime = detectDowntime(last.at, now);
  if (downtime) {
    const log = [downtime, ...(await listDowntimes(root))].slice(0, 50);
    await writeFile(logPath(root), JSON.stringify(log, null, 2), 'utf8').catch(() => undefined);
    console.log(`[Downtime] ${downtimeMessage(downtime)}`);
    try {
      await notify(downtime);
    } catch (err) {
      console.error('[Downtime] notify failed:', err);
    }
  }
  await beat(root);
  if (!timer) {
    timer = setInterval(() => void beat(root), HEARTBEAT_EVERY_MS);
    timer.unref?.();
  }
  return downtime;
}
