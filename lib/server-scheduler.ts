/**
 * Server-side background scheduler.
 * Loaded once on server startup via instrumentation.ts.
 * Runs application checks even when no browser tab is open.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  getApplicationById,
  insertStatusHistory,
  listApplications,
  pruneCheckLog,
  readSettings,
  touchMeta,
  updateApplicationFields,
  type LocalDbApplication,
  type LocalDbApplicationChangeField,
} from './local-db';
import { produceCheckOutputs, type CheckOutputs } from './check-outputs';
import { describeVerdicts, refreshChecklist, rejectionSummary } from './checklist-updates';
import { openDb } from './sqlite-db';
import { notifyClientSubscribers } from './client-notify';
import { sendPushToAll } from './push';
import { CHANGE_FIELD_LABELS, fetchApplicationStatusSession, parseMyGovDate } from './status-checker';
import {
  buildApplicationErrorMessage,
  buildCycleSummaryMessage,
  isTelegramConfigured,
  sendApplicationChangeNotification,
  sendTelegramMessage,
} from './telegram';
import { getMyGovStatus, getStatusType, isCompletedStatus } from '@/types';

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

export interface CheckOneResult {
  result: 'changed' | 'unchanged' | 'error';
  /** The fetched my.gov.uz session, when the check reached that point — lets callers (e.g. the Telegram bot) build a status screenshot without re-fetching. */
  session: Awaited<ReturnType<typeof fetchApplicationStatusSession>> | null;
  /** Screenshot / PDFs built for this check — only filled when called with `awaitOutputs`. */
  outputs?: CheckOutputs;
}

export async function checkOne(
  application: LocalDbApplication,
  options: { manual?: boolean; awaitOutputs?: boolean } = {},
): Promise<CheckOneResult> {
  // Mark as checking — single targeted update instead of a full-snapshot read/write,
  // so a concurrent PATCH/DELETE (or another checkOne call) can't race and lose data.
  if (!(await getApplicationById(application.id))) return { result: 'error', session: null };

  const checkingAt = new Date().toISOString();
  await updateApplicationFields(application.id, {
    sync_state: 'checking',
    last_error: '',
    updated_at: checkingAt,
  });
  await touchMeta(checkingAt);

  let session: Awaited<ReturnType<typeof fetchApplicationStatusSession>> | null = null;
  let fetchError: string | null = null;
  try {
    session = await fetchApplicationStatusSession(application.application_number, application.verification_password);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Неизвестная ошибка при проверке';
  }
  const checked = session?.status ?? null;

  const [entry, settings] = await Promise.all([getApplicationById(application.id), readSettings()]);
  if (!entry) return { result: 'error', session };

  const now = new Date().toISOString();
  const intervalMinutes = settings.auto_check.interval_minutes ?? 15;
  const nextCheckAt = settings.auto_check.enabled && intervalMinutes > 0
    ? (() => { const d = new Date(now); d.setMinutes(d.getMinutes() + intervalMinutes); return d.toISOString(); })()
    : null;

  if (!checked) {
    const errorMessage = fetchError ?? 'Не удалось получить статус от my.gov.uz';
    const errorPatch: Partial<LocalDbApplication> = {
      sync_state: 'error',
      last_checked_at: now,
      next_check_at: nextCheckAt,
      last_error: errorMessage,
      updated_at: now,
    };
    await updateApplicationFields(entry.id, errorPatch);
    await touchMeta(now);

    await writeCheckLog(entry.id, entry.application_number, 'error', [], errorMessage);

    if (isTelegramConfigured(settings)) {
      sendTelegramMessage(settings, buildApplicationErrorMessage({ ...entry, ...errorPatch }, errorMessage))
        .catch(err => console.error('[Scheduler] Telegram error (check error):', err));
    }
    // Only the first failure of a streak — retries every 5 minutes would spam the phone.
    if (application.sync_state !== 'error') {
      sendPushToAll({
        title: `№ ${entry.application_number} — ошибка проверки`,
        body: `${entry.object_name || entry.service_name} · ${errorMessage}`,
        data: { applicationId: entry.id },
        kind: 'error',
      }).catch(err => console.error('[Scheduler] Push error (check error):', err));
    }
    return { result: 'error', session };
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

  const fmt = (v: string | null) => v?.trim() || 'пусто';

  const patch: Partial<LocalDbApplication> = {
    status: nextValues.status,
    current_action: nextValues.current_action,
    acting_party: nextValues.acting_party,
    last_changed_date: nextValues.last_changed_date,
    sync_state: 'success',
    last_checked_at: now,
    next_check_at: nextCheckAt,
    last_error: '',
    last_change_summary: changedFields.map(f =>
      `${CHANGE_FIELD_LABELS[f]}: "${fmt(previousValues[f])}" → "${fmt(nextValues[f])}"`
    ),
    last_change_fields: changedFields,
  };
  if (changedFields.length > 0) patch.last_detected_change_at = now;

  if (isCompletedStatus(patch.status!)) {
    patch.archived = true;
    patch.sync_state = 'idle';
    patch.next_check_at = null;
  }
  patch.updated_at = now;

  await updateApplicationFields(entry.id, patch);
  await touchMeta(now);

  if (previousValues.status !== nextValues.status) {
    await insertStatusHistory({
      id: randomUUID(),
      application_id: entry.id,
      status: nextValues.status,
      current_action: nextValues.current_action,
      acting_party: nextValues.acting_party,
      recorded_at: now,
    });
  }

  const updatedEntry: LocalDbApplication = { ...entry, ...patch };

  const result: 'changed' | 'unchanged' = changedFields.length > 0 ? 'changed' : 'unchanged';
  await writeCheckLog(updatedEntry.id, updatedEntry.application_number, result, changedFields);

  // Approvals checklist from the same page: who has answered, the final verdict.
  const checklistUpdate = session
    ? await refreshChecklist(updatedEntry, session.page.html).catch(err => { console.error('[Scheduler] Checklist failed:', err); return null; })
    : null;
  const completedNow = isCompletedStatus(updatedEntry.status) && !isCompletedStatus(previousValues.status ?? '');
  if (checklistUpdate && checklistUpdate.newVerdicts.length > 0 && !completedNow) {
    const { title, body, urgent } = describeVerdicts(checklistUpdate);
    sendPushToAll({
      title: `№ ${updatedEntry.application_number} · ${title}`,
      body: [updatedEntry.object_name || updatedEntry.service_name, body].filter(Boolean).join(' · '),
      data: { applicationId: updatedEntry.id },
      kind: 'status-change',
      urgent,
    }).catch(err => console.error('[Scheduler] Push error (approvals):', err));
    if (isTelegramConfigured(settings)) {
      const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      sendTelegramMessage(settings, `🧾 <b>№ ${updatedEntry.application_number}</b> · ${esc(title)}\n${esc(body)}`)
        .catch(err => console.error('[Scheduler] Telegram error (approvals):', err));
    }
  }

  // Screenshot / status PDF / result documents: stored for the site and app,
  // and reused for the Telegram notification below. Official result documents
  // only appear on the page once the application is finalized.
  const outputs = produceCheckOutputs({ application: updatedEntry, session, changedFields, previousValues, nextValues, manual: options.manual })
    .catch(err => {
      console.error('[Scheduler] Failed to build check outputs:', err);
      return { readablePdf: null, screenshotPng: null, repositoryFiles: [] };
    });

  if (isTelegramConfigured(settings) && changedFields.length > 0) {
    const isNowCompleted = isCompletedStatus(updatedEntry.status) && !isCompletedStatus(previousValues.status ?? '');
    outputs.then(({ readablePdf, screenshotPng, repositoryFiles }) => sendApplicationChangeNotification({
      settings: settings,
      application: updatedEntry,
      changedFields,
      previousValues,
      nextValues,
      isNowCompleted,
      screenshotPng,
      readablePdf,
      repositoryFiles: isNowCompleted ? repositoryFiles : [],
    })).catch(err => console.error('[Scheduler] Telegram error (change):', err));
  }
  if (changedFields.length > 0) {
    const changes = changedFields.map(f => `${CHANGE_FIELD_LABELS[f]}: «${fmt(previousValues[f])}» → «${fmt(nextValues[f])}»`);
    sendPushToAll({
      title: `№ ${updatedEntry.application_number} — ${getMyGovStatus(updatedEntry.status).label}${completedNow ? ' ✓' : ''}`,
      body: [updatedEntry.object_name || updatedEntry.service_name, ...changes, completedNow ? rejectionSummary(checklistUpdate?.checklist) : '']
        .filter(Boolean).join(' · '),
      data: { applicationId: updatedEntry.id },
      kind: completedNow ? 'completed' : 'status-change',
      // The applicant has to act, or the final result is in — worth waking up for.
      urgent: completedNow || getStatusType(updatedEntry.acting_party, updatedEntry.status) === 'action_required',
    }).catch(err => console.error('[Scheduler] Push error (change):', err));

    // The official decision / conclusion PDFs arrive a little later than the status.
    if (completedNow) {
      outputs.then(({ repositoryFiles }) => repositoryFiles.length === 0 ? 0 : sendPushToAll({
        title: `№ ${updatedEntry.application_number} — документы результата получены`,
        body: [updatedEntry.object_name || updatedEntry.service_name, repositoryFiles.map(f => f.ref.title || 'Документ').join(', ')].filter(Boolean).join(' · '),
        data: { applicationId: updatedEntry.id },
        kind: 'completed',
        urgent: true,
      })).catch(err => console.error('[Scheduler] Push error (documents):', err));
    }
  }

  // Clients subscribed from a share page (Telegram) — status, stage, approvals, result.
  notifyClientSubscribers(updatedEntry, checklistUpdate?.checklist ?? null, {
    statusChanged: changedFields.includes('status'),
    actionChanged: changedFields.includes('current_action'),
    completed: completedNow,
    newVerdicts: checklistUpdate?.newVerdicts.length ?? 0,
  }).catch(err => console.error('[Scheduler] Client notify error:', err));

  if (options.awaitOutputs) return { result, session, outputs: await outputs };
  return { result, session };
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
    const settings = await readSettings();
    if (!settings.auto_check.enabled && !onlyIds) return;

    const concurrency = Math.max(1, settings.auto_check.concurrency_limit ?? 1);
    const delayMs = settings.auto_check.delay_between_checks_ms ?? 2500;

    const candidates = onlyIds
      ? (await Promise.all(onlyIds.map(id => getApplicationById(id)))).filter((a): a is LocalDbApplication => a !== null)
      : (await listApplications({ archived: false })).filter(a => !isCompletedStatus(a.status));

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
        if (results[j].result === 'changed') changedCount++;
        if (results[j].result === 'error') {
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
      const freshSettings = await readSettings();
      if (isTelegramConfigured(freshSettings)) {
        sendTelegramMessage(
          freshSettings,
          buildCycleSummaryMessage({ checkedCount, changedCount, errorCount, finishedAt: new Date().toISOString() }),
        ).catch(err => console.error('[Scheduler] Telegram error (cycle summary):', err));
      }
      sendPushToAll({
        title: 'Цикл проверки завершён',
        body: `Проверено ${checkedCount} · изменений ${changedCount} · ошибок ${errorCount}`,
        kind: 'cycle',
      }).catch(err => console.error('[Scheduler] Push error (cycle summary):', err));
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

  readSettings().then(settings => {
    if (!settings.auto_check.enabled) {
      console.log('[Scheduler] Auto-check disabled, not scheduling');
      _nextCycleAt = null;
      void persistSchedulerStatus();
      return;
    }
    const intervalMs = (settings.auto_check.interval_minutes ?? 15) * 60 * 1000;
    console.log(`[Scheduler] Next cycle in ${settings.auto_check.interval_minutes ?? 15} min`);
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
    const stale = (await listApplications({ archived: false })).filter(a => isCompletedStatus(a.status));
    if (stale.length === 0) return;

    const now = new Date().toISOString();
    for (const entry of stale) {
      await updateApplicationFields(entry.id, { archived: true, sync_state: 'idle', next_check_at: null, updated_at: now });
    }
    await touchMeta(now);
    console.log(`[Scheduler] Auto-archived ${stale.length} completed application(s)`);
  } catch (err) {
    console.error('[Scheduler] Failed to auto-archive completed applications:', err);
  }
}

/** Daily: drop old check_log rows; compact the file after a large cleanup. */
async function runMaintenance(): Promise<void> {
  try {
    const removed = await pruneCheckLog();
    if (removed > 0) console.log(`[Scheduler] Pruned ${removed} old check_log row(s)`);
    if (removed > 5000) {
      const sqlite = await openDb();
      sqlite.exec('VACUUM');
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
      console.log('[Scheduler] Database compacted');
    }
  } catch (err) {
    console.error('[Scheduler] Maintenance failed:', err);
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
  void runMaintenance();
  setInterval(() => void runMaintenance(), 24 * 60 * 60 * 1000);
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
