import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api, type CheckLogEntry } from '@/lib/api';
import { readValue, writeValue } from '@/lib/cache';

const LAST_SEEN_KEY = 'events_last_seen';
const listeners = new Set<() => void>();

/** Check-log rows worth showing as events: changes and errors (quiet checks are skipped). */
export function relevantEvents(entries: CheckLogEntry[]): CheckLogEntry[] {
  return entries.filter(e => e.result === 'error' || (e.result === 'changed' && e.changed_fields !== '[]'));
}

export async function markEventsSeen(): Promise<void> {
  await writeValue(LAST_SEEN_KEY, new Date().toISOString());
  listeners.forEach(fn => fn());
}

export async function lastSeenAt(): Promise<string | null> {
  return readValue(LAST_SEEN_KEY);
}

/** Unread event count for the tab badge; refreshes every minute and when the app comes back. */
export function useUnreadEvents(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [{ data }, seen] = await Promise.all([api.checkLog(100), lastSeenAt()]);
      const events = relevantEvents(data);
      setCount(seen ? events.filter(e => e.checked_at > seen).length : events.length);
    } catch {
      // offline / signed out — keep the last number
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    listeners.add(refresh);
    return () => {
      clearInterval(timer);
      sub.remove();
      listeners.delete(refresh);
    };
  }, [refresh]);

  return count;
}
