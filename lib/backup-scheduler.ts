/**
 * Daily encrypted backup at 03:00 local time, plus a catch-up run shortly after
 * boot when the last successful backup is older than a day (the PC may have been
 * off at 03:00). Loaded once via instrumentation.ts, like server-scheduler.ts.
 */
import { createBackup, readBackupStatus } from './backup';
import { readLocalDb } from './local-db';
import { isTelegramConfigured, sendTelegramMessage } from './telegram';

const BACKUP_HOUR = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 2 * DAY_MS;
const CATCH_UP_DELAY_MS = 2 * 60 * 1000;
const STALE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let started = false;
let lastStaleAlertDay = '';

export function msUntilNextRun(now: Date, hour = BACKUP_HOUR): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function notify(text: string): Promise<void> {
  try {
    const { settings } = await readLocalDb();
    if (isTelegramConfigured(settings)) await sendTelegramMessage(settings, text);
  } catch (err) {
    console.error('[Backup] Telegram notify failed:', err);
  }
}

async function checkStale(): Promise<void> {
  const status = await readBackupStatus();
  const last = status.lastSuccessAt ? Date.parse(status.lastSuccessAt) : 0;
  if (Date.now() - last < STALE_MS) return;
  const today = new Date().toDateString();
  if (lastStaleAlertDay === today) return;
  lastStaleAlertDay = today;
  await notify(`⚠️ Резервной копии базы не было больше 2 дней.${status.lastError ? `\nПоследняя ошибка: ${status.lastError}` : ''}\nПапка: ${status.dir}`);
}

async function run(reason: string): Promise<void> {
  console.log(`[Backup] Starting (${reason})`);
  const status = await createBackup();
  if (status.lastError) {
    console.error('[Backup] Failed:', status.lastError);
    await notify(`⚠️ Резервная копия не создана: ${status.lastError}`);
  } else {
    console.log(`[Backup] Saved ${status.lastFile} (${status.lastSize} bytes)`);
  }
  await checkStale();
}

function scheduleNext(): void {
  setTimeout(() => {
    void run('daily').finally(scheduleNext);
  }, msUntilNextRun(new Date()));
}

export function startBackupScheduler(): void {
  if (started) return;
  started = true;
  scheduleNext();
  void readBackupStatus().then((status) => {
    const last = status.lastSuccessAt ? Date.parse(status.lastSuccessAt) : 0;
    if (Date.now() - last > DAY_MS) setTimeout(() => void run('catch-up'), CATCH_UP_DELAY_MS);
  });
  setInterval(() => void checkStale(), STALE_CHECK_INTERVAL_MS);
}
