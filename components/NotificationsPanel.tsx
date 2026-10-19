'use client';

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { formatTimeAgo } from '@/lib/format-utils';
import { syncEngineEvents } from '@/lib/sync-engine';
import { getApplicationChangeFieldLabel, getMyGovStatus, type Application, type ApplicationChangeField } from '@/types';

export interface CheckLogEntry {
  id: string;
  application_id: string;
  application_number: string;
  checked_at: string;
  result: string;
  error_message: string | null;
  changed_fields: string;
}

interface ParsedCheckLogEntry extends CheckLogEntry {
  parsedChangedFields: string[];
}

type Tab = 'all' | 'changed' | 'error';

const LAST_SEEN_KEY = 'notif_last_seen';

function getLastSeen(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** One-line description of a check-log event, shared with the journal page. */
export function describeEvent(entry: CheckLogEntry, fields: string[], app?: Application): string {
  if (entry.result === 'error') return `Ошибка: ${entry.error_message ?? 'my.gov.uz не ответил'}`;
  // The newest change still has its "old → new" summary on the application.
  if (app?.last_detected_change_at && Math.abs(Date.parse(app.last_detected_change_at) - Date.parse(entry.checked_at)) < 120_000 && app.last_change_summary.length > 0) {
    return app.last_change_summary.join(' · ').replace(/"([^"]*)"/g, '«$1»');
  }
  return fields.map(f => {
    const label = getApplicationChangeFieldLabel(f as ApplicationChangeField);
    return f === 'status' && app ? `${label}: «${getMyGovStatus(app.status).label}»` : label;
  }).join(' · ') || 'Изменение';
}

export function NotificationsPanel() {
  const [open, setOpen]       = useState(false);
  const [entries, setEntries] = useState<ParsedCheckLogEntry[]>([]);
  const [apps, setApps]       = useState<Map<string, Application>>(new Map());
  const [lastSeen, setLastSeen] = useState('');
  const [tab, setTab]         = useState<Tab>('all');
  const panelRef              = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [data, active, archived] = await Promise.all([
        fetch('/api/check-log?limit=60').then(r => r.json()) as Promise<CheckLogEntry[]>,
        fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
        fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
      ]);
      if (!Array.isArray(data)) return;
      const relevant = data
        .filter(e => e.result === 'error' || (e.result === 'changed' && e.changed_fields !== '[]'))
        .map(e => ({
          ...e,
          parsedChangedFields: (() => { try { return JSON.parse(e.changed_fields); } catch { return []; } })(),
        }));
      const map = new Map<string, Application>();
      for (const a of [...(Array.isArray(active) ? active : []), ...(Array.isArray(archived) ? archived : [])]) map.set(a.id, a);
      startTransition(() => {
        setEntries(relevant);
        setApps(map);
        setLastSeen(getLastSeen());
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Re-fetch whenever a background sync cycle completes so the bell stays fresh
  useEffect(() => {
    window.addEventListener(syncEngineEvents.applications, load);
    window.addEventListener(syncEngineEvents.complete, load);
    return () => {
      window.removeEventListener(syncEngineEvents.applications, load);
      window.removeEventListener(syncEngineEvents.complete, load);
    };
  }, [load]);

  const isUnread = useCallback((e: CheckLogEntry) => !lastSeen || e.checked_at > lastSeen, [lastSeen]);
  const unread = useMemo(() => entries.filter(isUnread).length, [entries, isUnread]);
  const shown = useMemo(() => entries.filter(e => tab === 'all' || e.result === tab), [entries, tab]);
  const count = (t: Tab) => entries.filter(e => t === 'all' || e.result === t).length;

  function markAllRead() {
    const now = new Date().toISOString();
    try { localStorage.setItem(LAST_SEEN_KEY, now); } catch { /* private mode */ }
    setLastSeen(now);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [open]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'all', label: `Все · ${count('all')}` },
    { id: 'changed', label: `Изменения · ${count('changed')}` },
    { id: 'error', label: `Ошибки · ${count('error')}` },
  ];

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Уведомления"
        className="relative flex h-11 w-11 items-center justify-center rounded-[9px] transition hover:bg-[var(--panel)] active:scale-90 md:h-9 md:w-9"
        style={{ color: open ? 'var(--text)' : 'var(--text-muted)', background: open ? 'var(--panel)' : undefined }}
        title="Уведомления"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span
            aria-live="polite"
            className="absolute right-[5px] top-[5px] flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5 text-[9px] font-semibold text-white animate-pop"
            style={{ background: 'var(--danger)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-3 top-[64px] z-50 overflow-hidden md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+8px)] md:w-[400px] rounded-[12px] animate-scale-in"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-float)' }}
        >
          <div className="flex items-center justify-between px-4 pt-3" >
            <h3 className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Уведомления</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>
                Прочитать все
              </button>
            )}
          </div>
          <div className="flex gap-1.5 border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="rounded-[6px] px-2 py-1 text-[11px] font-medium transition"
                style={tab === t.id
                  ? { background: 'var(--text)', color: 'var(--surface)' }
                  : { background: 'var(--panel)', color: 'var(--text-soft)' }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {shown.length === 0 ? (
              <p className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Событий пока нет
              </p>
            ) : shown.map(e => {
              const app = apps.get(e.application_id);
              const isError = e.result === 'error';
              return (
                <Link
                  key={e.id}
                  href={`/applications/${e.application_id}`}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 border-b px-4 py-3 last:border-0 transition-colors hover:bg-[var(--panel)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                    style={{ background: isUnread(e) ? (isError ? 'var(--danger)' : 'var(--accent)') : 'transparent' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>№ {e.application_number}</p>
                      <p className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatTimeAgo(e.checked_at)} назад</p>
                    </div>
                    {app && (
                      <p className="mt-0.5 truncate text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                        {app.object_name || app.service_name}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] leading-[1.45]" style={{ color: isError ? 'var(--danger)' : 'var(--text-soft)' }}>
                      {describeEvent(e, e.parsedChangedFields, app)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          <Link href="/journal" onClick={() => setOpen(false)}
            className="block border-t px-4 py-2.5 text-center text-[12px] font-medium transition hover:bg-[var(--panel)]"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
            Открыть журнал проверок
          </Link>
        </div>
      )}
    </div>
  );
}
