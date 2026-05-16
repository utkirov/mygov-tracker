'use client';

import { useSyncExternalStore } from 'react';

import { showToast } from '@/lib/toast';
import { getStatusType, type Application } from '@/types';

type SyncEngineListener = () => void;

interface SyncSettings {
  enabled: boolean;
  intervalMinutes: number;
  delayBetweenChecksMs: number;
  concurrencyLimit: number;
}

export interface SyncEngineSnapshot {
  enabled: boolean;
  intervalMinutes: number;
  delayBetweenChecksMs: number;
  concurrencyLimit: number;
  isRunning: boolean;
  queueLength: number;
  queueApplicationIds: string[];
  currentApplicationId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunError: string | null;
}

const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_DELAY_BETWEEN_CHECKS_MS = 2500;
const DEFAULT_CONCURRENCY_LIMIT = 1;
const DEBOUNCE_DELAY_MS = 300;
const SETTINGS_ENDPOINT = '/api/settings';
const APPLICATIONS_ENDPOINT = '/api/applications';
const ENGINE_EVENT = 'sync-engine:updated';
const APPLICATIONS_EVENT = 'applications:updated';

const listeners = new Set<SyncEngineListener>();

let started = false;
let scheduledTimer: number | null = null;
let runningCycle: Promise<void> | null = null;
let pendingImmediateRun = false;
let lastNotifiedRunError: string | null = null;
let emitTimeoutId: number | null = null;

let snapshot: SyncEngineSnapshot = {
  enabled: false,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  delayBetweenChecksMs: DEFAULT_DELAY_BETWEEN_CHECKS_MS,
  concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
  isRunning: false,
  queueLength: 0,
  queueApplicationIds: [],
  currentApplicationId: null,
  lastRunAt: null,
  nextRunAt: null,
  lastRunError: null,
};

/**
 * Debounce helper that defers function execution
 * @param func Function to debounce
 * @param wait Delay in milliseconds
 * @returns Debounced function
 */
function debounce<Args extends unknown[]>(
  func: (...args: Args) => void,
  wait: number
): (...args: Args) => void {
  let timeoutId: number | null = null;

  return (...args: Args) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Emit listener notifications with debouncing to prevent excessive re-renders
 */
function emitListenerNotifications() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Debounced emit that prevents excessive listener notifications during rapid updates
 */
const debouncedEmit = debounce(() => {
  emitListenerNotifications();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ENGINE_EVENT, { detail: snapshot }));
  }
}, DEBOUNCE_DELAY_MS);

function emit() {
  debouncedEmit();
}

function updateSnapshot(patch: Partial<SyncEngineSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function notifyApplicationsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APPLICATIONS_EVENT));
  }
}

function clearScheduledTimer() {
  if (scheduledTimer !== null) {
    window.clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  return fallback;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  return fallback;
}

function buildNextRunAt(isoDate: string, intervalMinutes: number): string {
  const nextRun = new Date(isoDate);
  nextRun.setMinutes(nextRun.getMinutes() + intervalMinutes);
  return nextRun.toISOString();
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload = await response.json();
      if (payload && typeof payload.error === 'string' && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep the generic message if the response body is not JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function sendCycleSummaryNotification(args: {
  checkedCount: number;
  changedCount: number;
  errorCount: number;
  finishedAt: string;
}) {
  if (args.changedCount <= 0 && args.errorCount <= 0) {
    return;
  }

  try {
    await fetchJson('/api/notifications/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'cycle_summary',
        checkedCount: args.checkedCount,
        changedCount: args.changedCount,
        errorCount: args.errorCount,
        finishedAt: args.finishedAt,
      }),
    });
  } catch {
    // Summary delivery failures should not break the sync cycle.
  }
}

async function loadSettings(): Promise<SyncSettings> {
  const settings = await fetchJson<Record<string, unknown>>(SETTINGS_ENDPOINT, { cache: 'no-store' });

  return {
    enabled: settings.auto_check_enabled === true,
    intervalMinutes: toPositiveInteger(settings.auto_check_interval, DEFAULT_INTERVAL_MINUTES),
    delayBetweenChecksMs: toNonNegativeInteger(
      settings.auto_check_delay_ms,
      DEFAULT_DELAY_BETWEEN_CHECKS_MS
    ),
    concurrencyLimit: toPositiveInteger(settings.auto_check_concurrency, DEFAULT_CONCURRENCY_LIMIT),
  };
}

function sortApplicationsForQueue(applications: Application[]): Application[] {
  return [...applications].sort((left, right) => {
    const leftPriority = left.last_checked_at ?? left.created_at;
    const rightPriority = right.last_checked_at ?? right.created_at;
    return leftPriority.localeCompare(rightPriority);
  });
}

async function loadQueueApplications(): Promise<Application[]> {
  const applications = await fetchJson<Application[]>(APPLICATIONS_ENDPOINT, { cache: 'no-store' });

  return sortApplicationsForQueue(
    applications.filter((application) =>
      !application.archived &&
      getStatusType(application.acting_party, application.status) !== 'completed'
    )
  );
}

function scheduleNextCycle(delayMs: number) {
  if (!started) {
    return;
  }

  clearScheduledTimer();
  scheduledTimer = window.setTimeout(() => {
    void runCycle('scheduled');
  }, Math.max(0, delayMs));
}

async function runCycle(trigger: 'scheduled' | 'immediate' | 'start') {
  if (!started) {
    return;
  }

  if (runningCycle) {
    if (trigger === 'immediate') {
      pendingImmediateRun = true;
    }
    return runningCycle;
  }

  runningCycle = (async () => {
    let settings: SyncSettings;

    try {
      settings = await loadSettings();
      updateSnapshot({
        enabled: settings.enabled,
        intervalMinutes: settings.intervalMinutes,
        delayBetweenChecksMs: settings.delayBetweenChecksMs,
        concurrencyLimit: settings.concurrencyLimit,
        lastRunError: null,
      });
    } catch (error) {
      updateSnapshot({
        isRunning: false,
        queueLength: 0,
        queueApplicationIds: [],
        currentApplicationId: null,
        nextRunAt: null,
        lastRunError: error instanceof Error ? error.message : 'Failed to load sync settings',
      });
      return;
    }

    if (!settings.enabled) {
      updateSnapshot({
        isRunning: false,
        queueLength: 0,
        queueApplicationIds: [],
        currentApplicationId: null,
        nextRunAt: null,
      });
      return;
    }

    updateSnapshot({
      isRunning: true,
      lastRunError: null,
      currentApplicationId: null,
    });

    try {
      const queue = await loadQueueApplications();
      const queueApplicationIds = queue.map((application) => application.id);

      updateSnapshot({
        queueLength: queueApplicationIds.length,
        queueApplicationIds,
      });

      let lastRunError: string | null = null;
      let changedCount = 0;
      let errorCount = 0;
      const pendingQueue = [...queue];
      const queueState = [...queueApplicationIds];

      async function processNextApplication() {
        while (pendingQueue.length > 0) {
          const application = pendingQueue.shift();
          if (!application) {
            return;
          }

          const queueIndex = queueState.indexOf(application.id);
          if (queueIndex >= 0) {
            queueState.splice(queueIndex, 1);
          }

          updateSnapshot({
            currentApplicationId: application.id,
            queueLength: queueState.length,
            queueApplicationIds: [...queueState],
          });

          try {
            const result = await fetchJson<{ application?: Application; statusChanged?: boolean }>(
              `/api/applications/${application.id}/check`,
              {
                method: 'POST',
                cache: 'no-store',
              }
            );

            const checkedApplication = result.application;
            if (checkedApplication && checkedApplication.last_change_fields.length > 0) {
              changedCount += 1;
              showToast({
                title:
                  checkedApplication.object_name ||
                  checkedApplication.service_name ||
                  `Заявление ${checkedApplication.application_number}`,
                description:
                  checkedApplication.last_change_summary[0] ?? 'Зафиксировано новое изменение.',
                tone: 'success',
              });
            }
          } catch (error) {
            errorCount += 1;
            lastRunError = error instanceof Error ? error.message : 'Application check failed';
          } finally {
            notifyApplicationsUpdated();
          }

          if (pendingQueue.length > 0 && settings.delayBetweenChecksMs > 0) {
            await wait(settings.delayBetweenChecksMs);
          }
        }
      }

      const workerCount = Math.min(settings.concurrencyLimit, Math.max(queue.length, 1));
      await Promise.all(Array.from({ length: workerCount }, () => processNextApplication()));

      const finishedAt = new Date().toISOString();

      await sendCycleSummaryNotification({
        checkedCount: queue.length,
        changedCount,
        errorCount,
        finishedAt,
      });

      updateSnapshot({
        isRunning: false,
        queueLength: 0,
        queueApplicationIds: [],
        currentApplicationId: null,
        lastRunAt: finishedAt,
        nextRunAt: buildNextRunAt(finishedAt, settings.intervalMinutes),
        lastRunError,
      });
    } catch (error) {
      const finishedAt = new Date().toISOString();

      updateSnapshot({
        isRunning: false,
        queueLength: 0,
        queueApplicationIds: [],
        currentApplicationId: null,
        lastRunAt: finishedAt,
        nextRunAt: buildNextRunAt(finishedAt, settings.intervalMinutes),
        lastRunError: error instanceof Error ? error.message : 'Background sync failed',
      });
    }
  })();

  try {
    await runningCycle;
  } finally {
    runningCycle = null;

    if (!started) {
      return;
    }

    if (pendingImmediateRun) {
      pendingImmediateRun = false;
      scheduleNextCycle(0);
      return;
    }

    scheduleNextCycle(snapshot.intervalMinutes * 60 * 1000);
  }
}

export function startSyncEngine() {
  if (started) {
    return;
  }

  started = true;
  void runCycle('start');
}

export function stopSyncEngine() {
  started = false;
  pendingImmediateRun = false;
  clearScheduledTimer();
}

export function subscribeSyncEngine(listener: SyncEngineListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncEngineSnapshot(): SyncEngineSnapshot {
  return snapshot;
}

export function requestImmediateSyncRun() {
  if (!started) {
    return;
  }

  clearScheduledTimer();

  if (runningCycle) {
    pendingImmediateRun = true;
    showToast({
      title: 'Цикл уже выполняется',
      description: 'Повторный проход поставлен в очередь и запустится сразу после текущего цикла.',
      tone: 'info',
    });
    return;
  }

  showToast({
    title: 'Цикл проверки запущен',
    description: 'Очередь начала обход активных заявлений.',
    tone: 'info',
  });
  void runCycle('immediate');
}

export function useSyncEngineSnapshot(): SyncEngineSnapshot {
  return useSyncExternalStore(subscribeSyncEngine, getSyncEngineSnapshot, getSyncEngineSnapshot);
}

export const syncEngineEvents = {
  engine: ENGINE_EVENT,
  applications: APPLICATIONS_EVENT,
};

if (typeof window !== 'undefined') {
  window.addEventListener(ENGINE_EVENT, ((event: Event) => {
    const customEvent = event as CustomEvent<SyncEngineSnapshot>;
    const nextError = customEvent.detail?.lastRunError ?? null;

    if (!nextError || nextError === lastNotifiedRunError) {
      return;
    }

    lastNotifiedRunError = nextError;
    showToast({
      title: 'Ошибка фоновой очереди',
      description: nextError,
      tone: 'error',
    });
  }) as EventListener);
}
