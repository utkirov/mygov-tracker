/**
 * Server-side background scheduler.
 * Loaded once on server startup via instrumentation.ts.
 * Runs application checks even when no browser tab is open.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  readLocalDb,
  writeLocalDb,
  type LocalDbApplication,
  type LocalDbApplicationChangeField,
} from './local-db';
import { openDb } from './sqlite-db';
import { fetchApplicationStatus } from './status-checker';
import {
  buildApplicationChangeMessage,
  buildApplicationCompletedMessage,
  buildApplicationErrorMessage,
  buildCycleSummaryMessage,
  isTelegramConfigured,
  sendTelegramMessage,
} from './telegram';
import { isCompletedStatus } from '@/types';

let _timer: ReturnType<typeof setTimeout> | null = null;
let _running = false;
let _startedAt: string | null = null;
let _lastCycleStartedAt: string | null = null;
let _lastCycleFinishedAt: string | null = null;
let _nextCycleAt: string | null = null;
let _lastSummary: { checkedCount: number; changedCount: number; errorCount: number } | null = null;
const SCHEDULER_STATUS_PATH = join(process.cwd(), 'data', 'scheduler-status.json');

function getServerSchedulerStatusSnapshot() {
  return {
    running: _running,
    startedAt: _startedAt,
    lastCycleStartedAt: _lastCycleStartedAt,
    lastCycleFinishedAt: _lastCycleFinishedAt,
    nextCycleAt: _nextCycleAt,
    lastSummary: _lastSummary,
  };
}

async function persistSchedulerStatus(): Promise<void> {
  try {
    await mkdir(dirname(SCHEDULER_STATUS_PATH), { recursive: true });
    await writeFile(
      SCHEDULER_STATUS_PATH,
      JSON.stringify(
        {
          ...getServerSchedulerStatusSnapshot(),
          heartbeatAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (err) {
    console.error('[Scheduler] Failed to persist status:', err);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function parseMyGovDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const [, dd, mm, yyyy, hh = '00', min = '00'] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

async function writeCheckLog(
  applicationId: string,
  applicationNumber: string,
  result: 'changed' | 'unchanged' | 'error',
  changedFields: LocalDbApplicationChangeField[],
  errorMessage?: string,
): Promise<void> {
  try {
    const sqlite = await openDb();
    sqlite.prepare(`
      INSERT INTO check_log (id, application_id, application_number, checked_at, result, error_message, changed_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      applicationId,
      applicationNumber,
      new Date().toISOString(),
      result,
      errorMessage ?? null,
      JSON.stringify(changedFields),
    );
  } catch (err) {
    console.error('[Scheduler] Failed to write check_log:', err);
  }
}

// ── single-application check ───────────────────────────────────────────────

async function checkOne(application: LocalDbApplication): Promise<'changed' | 'unchanged' | 'error'> {
  // Mark as checking
  {
    const db = await readLocalDb();
    const entry = db.applications.find(a => a.id === application.id);
    if (!entry) return 'error';
    entry.sync_state = 'checking';
    entry.last_error = '';
    entry.updated_at = new Date().toISOString();
    db.meta.updated_at = entry.updated_at;
    await writeLocalDb(db);
  }

  let checked: Awaited<ReturnType<typeof fetchApplicationStatus>> | null = null;
  let fetchError: string | null = null;
  try {
    checked = await fetchApplicationStatus(application.application_number, application.verification_password);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Неизвестная ошибка при проверке';
  }

  const db = await readLocalDb();
  const entry = db.applications.find(a => a.id === application.id);
  if (!entry) return 'error';

  const now = new Date().toISOString();
  const intervalMinutes = db.settings.auto_check.interval_minutes ?? 15;
  const nextCheckAt = db.settings.auto_check.enabled && intervalMinutes > 0
    ? (() => { const d = new Date(now); d.setMinutes(d.getMinutes() + intervalMinutes); return d.toISOString(); })()
    : null;

  if (!checked) {
    const errorMessage = fetchError ?? 'Не удалось получить статус от my.gov.uz';
    entry.sync_state = 'error';
    entry.last_checked_at = now;
    entry.next_check_at = nextCheckAt;
    entry.last_error = errorMessage;
    entry.updated_at = now;
    db.meta.updated_at = now;
    await writeLocalDb(db);

    await writeCheckLog(entry.id, entry.application_number, 'error', [], errorMessage);

    if (isTelegramConfigured(db.settings)) {
      sendTelegramMessage(db.settings, buildApplicationErrorMessage(entry, errorMessage))
        .catch(err => console.error('[Scheduler] Telegram error (check error):', err));
    }
    return 'error';
  }

  const previousValues = {
    status: entry.status,
    current_action: entry.current_action,
    acting_party: entry.acting_party,
    last_changed_date: entry.last_changed_date,
  };
  const nextValues = {
    status: checked.status,
    current_action: checked.current_action,
    acting_party: checked.acting_party,
    last_changed_date: parseMyGovDate(checked.last_changed_date),
  };
  const trackedFields: LocalDbApplicationChangeField[] = ['status', 'current_action', 'acting_party', 'last_changed_date'];
  const changedFields = trackedFields.filter(f => previousValues[f] !== nextValues[f]);

  const labels: Record<LocalDbApplicationChangeField, string> = {
    status: 'Статус', current_action: 'Текущее действие',
    acting_party: 'Действует', last_changed_date: 'Последнее изменение',
  };
  const fmt = (v: string | null) => v?.trim() || 'пусто';

  entry.status = nextValues.status;
  entry.current_action = nextValues.current_action;
  entry.acting_party = nextValues.acting_party;
  entry.last_changed_date = nextValues.last_changed_date;
  entry.sync_state = 'success';
  entry.last_checked_at = now;
  entry.next_check_at = nextCheckAt;
  entry.last_error = '';
  entry.last_change_summary = changedFields.map(f =>
    `${labels[f]}: "${fmt(previousValues[f])}" → "${fmt(nextValues[f])}"`
  );
  entry.last_change_fields = changedFields;
  if (changedFields.length > 0) entry.last_detected_change_at = now;

  if (isCompletedStatus(entry.status)) {
    entry.archived = true;
    entry.sync_state = 'idle';
    entry.next_check_at = null;
  }
  entry.updated_at = now;

  if (previousValues.status !== nextValues.status) {
    db.status_history.push({
      id: randomUUID(),
      application_id: entry.id,
      status: nextValues.status,
      current_action: nextValues.current_action,
      acting_party: nextValues.acting_party,
      recorded_at: now,
    });
  }

  db.meta.updated_at = now;
  await writeLocalDb(db);

  const result: 'changed' | 'unchanged' = changedFields.length > 0 ? 'changed' : 'unchanged';
  await writeCheckLog(entry.id, entry.application_number, result, changedFields);

  if (isTelegramConfigured(db.settings) && changedFields.length > 0) {
    const isNowCompleted = isCompletedStatus(entry.status) && !isCompletedStatus(previousValues.status ?? '');
    const message = isNowCompleted
      ? buildApplicationCompletedMessage(entry)
      : buildApplicationChangeMessage({ application: entry, changedFields, previousValues, nextValues });
    sendTelegramMessage(db.settings, message)
      .catch(err => console.error('[Scheduler] Telegram error (change):', err));
  }

  return result;
}

// ── cycle ──────────────────────────────────────────────────────────────────

async function runCycle(onlyIds?: string[]): Promise<void> {
  if (_running) {
    console.log('[Scheduler] Cycle already running, skipping');
    return;
  }
  _running = true;
  _lastCycleStartedAt = new Date().toISOString();
  void persistSchedulerStatus();

  try {
    const db = await readLocalDb();
    if (!db.settings.auto_check.enabled && !onlyIds) return;

    const concurrency = Math.max(1, db.settings.auto_check.concurrency_limit ?? 1);
    const delayMs = db.settings.auto_check.delay_between_checks_ms ?? 2500;

    const candidates = db.applications.filter(a => {
      if (onlyIds) return onlyIds.includes(a.id);
      return !a.archived && !isCompletedStatus(a.status);
    });

    if (candidates.length === 0) {
      console.log('[Scheduler] No candidates to check');
      return;
    }

    console.log(`[Scheduler] Starting cycle: ${candidates.length} application(s)${onlyIds ? ' (retry)' : ''}`);

    let checkedCount = 0;
    let changedCount = 0;
    let errorCount = 0;
    const failedIds: string[] = [];

    for (let i = 0; i < candidates.length; i += concurrency) {
      const batch = candidates.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(a => checkOne(a)));
      for (let j = 0; j < results.length; j++) {
        checkedCount++;
        if (results[j] === 'changed') changedCount++;
        if (results[j] === 'error') {
          errorCount++;
          failedIds.push(batch[j].id);
        }
      }
      if (i + concurrency < candidates.length && delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    console.log(`[Scheduler] Cycle done: checked=${checkedCount} changed=${changedCount} errors=${errorCount}`);
    _lastSummary = { checkedCount, changedCount, errorCount };
    void persistSchedulerStatus();

    // Don't send cycle summary for retry runs — the original cycle already sent one
    if (!onlyIds) {
      const freshDb = await readLocalDb();
      if (isTelegramConfigured(freshDb.settings)) {
        sendTelegramMessage(
          freshDb.settings,
          buildCycleSummaryMessage({ checkedCount, changedCount, errorCount, finishedAt: new Date().toISOString() }),
        ).catch(err => console.error('[Scheduler] Telegram error (cycle summary):', err));
      }
    }

    // Retry failed applications in 5 minutes (only once, no cascade)
    if (failedIds.length > 0 && !onlyIds) {
      console.log(`[Scheduler] Scheduling retry for ${failedIds.length} failed app(s) in 5 min`);
      setTimeout(() => {
        runCycle(failedIds).catch(err => console.error('[Scheduler] Retry cycle error:', err));
      }, 5 * 60 * 1000);
    }
  } catch (err) {
    console.error('[Scheduler] Cycle error:', err);
  } finally {
    _running = false;
    _lastCycleFinishedAt = new Date().toISOString();
    void persistSchedulerStatus();
  }
}

// ── scheduling ─────────────────────────────────────────────────────────────

function scheduleNext(): void {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }

  readLocalDb().then(db => {
    if (!db.settings.auto_check.enabled) {
      console.log('[Scheduler] Auto-check disabled, not scheduling');
      _nextCycleAt = null;
      void persistSchedulerStatus();
      return;
    }
    const intervalMs = (db.settings.auto_check.interval_minutes ?? 15) * 60 * 1000;
    console.log(`[Scheduler] Next cycle in ${db.settings.auto_check.interval_minutes ?? 15} min`);
    _nextCycleAt = new Date(Date.now() + intervalMs).toISOString();
    void persistSchedulerStatus();
    _timer = setTimeout(async () => {
      _nextCycleAt = null;
      void persistSchedulerStatus();
      await runCycle();
      scheduleNext();
    }, intervalMs);
  }).catch(err => {
    console.error('[Scheduler] Failed to read settings:', err);
    _nextCycleAt = new Date(Date.now() + 60_000).toISOString();
    void persistSchedulerStatus();
    _timer = setTimeout(() => scheduleNext(), 60_000);
  });
}

// ── public API ─────────────────────────────────────────────────────────────

/** Archive any applications whose status is completed but archived flag was never set. */
async function archiveCompletedApplications(): Promise<void> {
  try {
    const db = await readLocalDb();
    const stale = db.applications.filter(a => !a.archived && isCompletedStatus(a.status));
    if (stale.length === 0) return;

    const now = new Date().toISOString();
    for (const entry of stale) {
      entry.archived = true;
      entry.sync_state = 'idle';
      entry.next_check_at = null;
      entry.updated_at = now;
    }
    db.meta.updated_at = now;
    await writeLocalDb(db);
    console.log(`[Scheduler] Auto-archived ${stale.length} completed application(s)`);
  } catch (err) {
    console.error('[Scheduler] Failed to auto-archive completed applications:', err);
  }
}

export function startServerScheduler(): void {
  if (_startedAt !== null) {
    console.log('[Scheduler] Start requested, but the scheduler is already active');
    return;
  }

  console.log('[Scheduler] Server-side auto-check started');
  _startedAt = new Date().toISOString();
  void persistSchedulerStatus();
  archiveCompletedApplications().catch(() => {});
  scheduleNext();
}

export function stopServerScheduler(): void {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _startedAt = null;
  _nextCycleAt = null;
  void persistSchedulerStatus();
  console.log('[Scheduler] Stopped');
}

/** Call this when settings change so the new interval takes effect immediately. */
export function reschedule(): void {
  console.log('[Scheduler] Settings changed — rescheduling');
  scheduleNext();
}

/** Trigger an immediate full cycle (e.g. from an API route or tray "Check now"). */
export async function triggerImmediateCycle(): Promise<void> {
  await runCycle();
  scheduleNext();
}

export function getServerSchedulerStatus() {
  return getServerSchedulerStatusSnapshot();
}
