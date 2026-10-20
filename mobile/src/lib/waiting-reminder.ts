import type { Application } from '@/lib/api';
import { readValue, writeValue } from '@/lib/cache';
import { statusType } from '@/lib/status';

import { liveUpdate } from '../../modules/live-update';

/**
 * Ongoing notification «N ждут вашего действия» that stays until nothing is
 * waiting — promoted as a Live Update (status bar chip, Glyph on Nothing), red
 * on Android 17. Refreshed whenever the app or the background sync loads the board.
 */
const REMINDER_ID = 7200;
const KEY = 'waiting_reminder';

export async function isWaitingReminderOn(): Promise<boolean> {
  return (await readValue(KEY)) !== '0';
}

export async function setWaitingReminder(on: boolean, apps?: Application[]): Promise<void> {
  await writeValue(KEY, on ? '1' : '0');
  if (!on) liveUpdate.end(REMINDER_ID);
  else if (apps) await syncWaitingReminder(apps);
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export async function syncWaitingReminder(activeApps: Application[]): Promise<void> {
  const waiting = activeApps.filter(a => !a.archived && statusType(a) === 'action_required');
  if (waiting.length === 0 || !(await isWaitingReminderOn())) {
    liveUpdate.end(REMINDER_ID);
    return;
  }
  const n = waiting.length;
  liveUpdate.showStatus(
    REMINDER_ID,
    `${n} ${plural(n, 'заявление ждёт', 'заявления ждут', 'заявлений ждут')} вашего действия`,
    waiting.slice(0, 4).map(a => `№ ${a.application_number} · ${a.object_name || a.service_name}`).join('\n'),
    'danger',
  );
}
