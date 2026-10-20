/**
 * Daily pushes so nothing is missed (app Settings → «Напоминания», «Утренняя сводка»):
 *   09:00 — summary: waiting / in progress / changes and errors in the last 24 h / stalled
 *   10:00 — reminder for every application still waiting for the applicant
 * Runs inside the server; the last sent day is persisted so a restart doesn't repeat them.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { listApplications, type LocalDbApplication } from './local-db';
import { resolveLocalProjectRoot } from './local-paths';
import { sendPushToAll } from './push';
import { openDb } from './sqlite-db';
import { getMyGovStatus, getStatusType } from '@/types';

const DIGEST_HOUR = 9;
const REMINDER_HOUR = 10;
const STALLED_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ScheduleState { digestDay?: string; reminderDay?: string }

function statePath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'push-schedule.json');
}

async function readState(rootPath?: string): Promise<ScheduleState> {
  try {
    return JSON.parse(await readFile(statePath(rootPath), 'utf8')) as ScheduleState;
  } catch {
    return {};
  }
}

async function writeState(state: ScheduleState, rootPath?: string): Promise<void> {
  await mkdir(path.dirname(statePath(rootPath)), { recursive: true });
  await writeFile(statePath(rootPath), JSON.stringify(state), 'utf8');
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** When the application last moved on my.gov.uz (or, failing that, when we saw it change). */
function lastMovement(app: LocalDbApplication): number {
  const value = app.last_changed_date ?? app.last_detected_change_at ?? app.created_at;
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? Date.now() : time;
}

export interface DigestCounts { active: number; waiting: number; changed24h: number; errors24h: number; stalled: number }

export function buildDigest(counts: DigestCounts): { title: string; body: string } {
  const parts = [
    `${counts.waiting} ${plural(counts.waiting, 'ждёт', 'ждут', 'ждут')} вашего действия`,
    `${counts.active - counts.waiting} в обработке`,
    `за сутки изменений: ${counts.changed24h}`,
  ];
  if (counts.errors24h > 0) parts.push(`ошибок проверки: ${counts.errors24h}`);
  if (counts.stalled > 0) parts.push(`без движения ${STALLED_DAYS}+ дней: ${counts.stalled}`);
  return { title: `Сводка · ${counts.active} ${plural(counts.active, 'активное заявление', 'активных заявления', 'активных заявлений')}`, body: parts.join(' · ') };
}

export function waitingDays(app: LocalDbApplication, now = Date.now()): number {
  return Math.max(0, Math.floor((now - lastMovement(app)) / DAY_MS));
}

async function sendDigest(rootPath?: string): Promise<void> {
  const apps = (await listApplications({ archived: false }, rootPath)).filter(a => getStatusType(a.acting_party, a.status) !== 'completed');
  if (apps.length === 0) return;
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const db = await openDb(rootPath);
  const log = db.prepare(`SELECT result, COUNT(*) AS n FROM check_log WHERE checked_at >= ? AND result IN ('changed', 'error') GROUP BY result`)
    .all(since) as Array<{ result: string; n: number }>;
  const { title, body } = buildDigest({
    active: apps.length,
    waiting: apps.filter(a => getStatusType(a.acting_party, a.status) === 'action_required').length,
    changed24h: log.find(r => r.result === 'changed')?.n ?? 0,
    errors24h: log.find(r => r.result === 'error')?.n ?? 0,
    stalled: apps.filter(a => Date.now() - lastMovement(a) >= STALLED_DAYS * DAY_MS).length,
  });
  await sendPushToAll({ title, body, kind: 'digest' }, rootPath);
}

async function sendReminders(rootPath?: string): Promise<void> {
  const waiting = (await listApplications({ archived: false }, rootPath))
    .filter(a => getStatusType(a.acting_party, a.status) === 'action_required' && waitingDays(a) >= 1);
  for (const app of waiting) {
    const days = waitingDays(app);
    await sendPushToAll({
      title: `№ ${app.application_number} ждёт вашего действия · ${days} ${plural(days, 'день', 'дня', 'дней')}`,
      body: [app.object_name || app.service_name, getMyGovStatus(app.status).label, app.current_action].filter(Boolean).join(' · '),
      data: { applicationId: app.id },
      kind: 'reminder',
      urgent: true,
    }, rootPath);
  }
}

/** One tick: sends whatever is due today and hasn't been sent yet. Exported for tests. */
export async function runPushSchedule(now = new Date(), rootPath?: string): Promise<ScheduleState> {
  const state = await readState(rootPath);
  const today = localDay(now);
  if (now.getHours() >= DIGEST_HOUR && state.digestDay !== today) {
    state.digestDay = today;
    await writeState(state, rootPath);
    await sendDigest(rootPath).catch(err => console.error('[PushSchedule] Digest failed:', err));
  }
  if (now.getHours() >= REMINDER_HOUR && state.reminderDay !== today) {
    state.reminderDay = today;
    await writeState(state, rootPath);
    await sendReminders(rootPath).catch(err => console.error('[PushSchedule] Reminders failed:', err));
  }
  return state;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startPushSchedule(): void {
  if (timer) return;
  timer = setInterval(() => void runPushSchedule().catch(() => {}), 5 * 60 * 1000);
  timer.unref?.();
  void runPushSchedule().catch(() => {});
}
