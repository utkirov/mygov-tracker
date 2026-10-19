'use client';

import { useSyncExternalStore } from 'react';

import { showToast } from '@/lib/toast';

type SyncEngineListener = () => void;

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

interface HealthResponse {
  ok: boolean;
  time: string;
  autoCheck: {
    enabled: boolean;
    intervalMinutes: number | null;
    delayBetweenChecksMs: number | null;
    concurrencyLimit: number | null;
  };
  scheduler: {
    running: boolean;
    startedAt: string | null;
    lastCycleStartedAt: string | null;
    lastCycleFinishedAt: string | null;
    nextCycleAt: string | null;
    lastSummary: { checkedCount: number; changedCount: number; errorCount: number } | null;
  };
}

const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_DELAY_BETWEEN_CHECKS_MS = 2500;
const DEFAULT_CONCURRENCY_LIMIT = 1;
/**
 * Debounce delay for listener notifications (ms)
 * Trade-off: 300ms reduces excessive re-renders during rapid updates
 * but means UI updates may be delayed up to 300ms during high-activity periods
 */
const DEBOUNCE_DELAY_MS = 300;
const HEALTH_ENDPOINT = '/api/health';
const SYNC_ENDPOINT = '/api/sync';
// The actual checking happens server-side (lib/server-scheduler.ts); this engine
// just polls the server's status. Poll faster while a cycle might be in flight
// so the UI picks up completion promptly, and back off when idle.
const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 20_000;
const ENGINE_EVENT = 'sync-engine:updated';
const APPLICATIONS_EVENT = 'applications:updated';

const listeners = new Set<SyncEngineListener>();

let started = false;
let scheduledTimer: number | null = null;
let lastSeenCycleFinishedAt: string | null = null;
let lastNotifiedRunError: string | null = null;

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
 * Generic debounce function that delays and coalesces function calls.
 * Useful for reducing excessive listener notifications during rapid state changes.
 * Returns a debounced function with a cancel method to clear pending calls.
 * @param func Function to debounce
 * @param wait Delay in milliseconds
 * @returns Debounced function with cancel method
 */
function debounce<Args extends unknown[]>(
  func: (...args: Args) => void,
  wait: number
): {
  (...args: Args): void;
  cancel(): void;
} {
  let timeoutId: number | null = null;

  const debounced = (...args: Args) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

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

function scheduleNextPoll(delayMs: number) {
  if (!started) {
    return;
  }

  clearScheduledTimer();
  scheduledTimer = window.setTimeout(() => {
    void pollHealth();
  }, Math.max(0, delayMs));
}

async function pollHealth(): Promise<void> {
  if (!started) {
    return;
  }

  try {
    const health = await fetchJson<HealthResponse>(HEALTH_ENDPOINT, { cache: 'no-store' });

    const cycleJustFinished =
      health.scheduler.lastCycleFinishedAt !== null &&
      health.scheduler.lastCycleFinishedAt !== lastSeenCycleFinishedAt;

    updateSnapshot({
      enabled: health.autoCheck.enabled,
      intervalMinutes: toPositiveInteger(health.autoCheck.intervalMinutes, DEFAULT_INTERVAL_MINUTES),
      delayBetweenChecksMs: toNonNegativeInteger(
        health.autoCheck.delayBetweenChecksMs,
        DEFAULT_DELAY_BETWEEN_CHECKS_MS
      ),
      concurrencyLimit: toPositiveInteger(health.autoCheck.concurrencyLimit, DEFAULT_CONCURRENCY_LIMIT),
      isRunning: health.scheduler.running,
      lastRunAt: health.scheduler.lastCycleFinishedAt,
      nextRunAt: health.scheduler.nextCycleAt,
      lastRunError: null,
    });

    if (cycleJustFinished) {
      lastSeenCycleFinishedAt = health.scheduler.lastCycleFinishedAt;
      notifyApplicationsUpdated();

      const errorCount = health.scheduler.lastSummary?.errorCount ?? 0;
      if (errorCount > 0) {
        window.dispatchEvent(new Event(syncEngineEvents.error));
      } else {
        window.dispatchEvent(new Event(syncEngineEvents.complete));
      }
    }
  } catch (error) {
    // A failed poll (e.g. transient network hiccup) is not the same as a failed
    // check cycle — surface it via lastRunError/toast, but don't dispatch the
    // cycle-error event, which pages treat as "a check cycle just failed".
    updateSnapshot({
      lastRunError: error instanceof Error ? error.message : 'Failed to load sync status',
    });
  } finally {
    scheduleNextPoll(snapshot.isRunning ? FAST_POLL_MS : SLOW_POLL_MS);
  }
}

export function startSyncEngine() {
  if (started) {
    return;
  }

  started = true;
  void pollHealth();
}

export function stopSyncEngine() {
  started = false;
  clearScheduledTimer();
  debouncedEmit.cancel(); // Cancel any pending listener notifications
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

/**
 * Call this after saving settings so the client-side engine immediately
 * reflects the new interval/enabled state — the real scheduling now lives on
 * the server (lib/server-scheduler.ts's reschedule()); this just re-polls
 * /api/health right away instead of waiting for the next poll tick.
 */
export function rescheduleSyncEngine(): void {
  if (!started) return;
  scheduleNextPoll(0);
}

export function requestImmediateSyncRun() {
  if (!started) {
    return;
  }

  if (snapshot.isRunning) {
    showToast({
      title: 'Цикл уже выполняется',
      description: 'Дождитесь завершения текущего цикла проверки.',
      tone: 'info',
    });
    return;
  }

  showToast({
    title: 'Цикл проверки запущен',
    description: 'Сервер начал обход активных заявлений.',
    tone: 'info',
  });

  fetchJson(SYNC_ENDPOINT, { method: 'POST' })
    .then(() => {
      // Poll again shortly so the UI picks up the newly-started cycle quickly.
      scheduleNextPoll(500);
    })
    .catch((error) => {
      updateSnapshot({
        lastRunError: error instanceof Error ? error.message : 'Failed to start sync cycle',
      });
    });
}

export function useSyncEngineSnapshot(): SyncEngineSnapshot {
  return useSyncExternalStore(subscribeSyncEngine, getSyncEngineSnapshot, getSyncEngineSnapshot);
}

export const syncEngineEvents = {
  engine: ENGINE_EVENT,
  applications: APPLICATIONS_EVENT,
  complete: 'sync-engine:cycle-complete',
  error: 'sync-engine:cycle-error',
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
