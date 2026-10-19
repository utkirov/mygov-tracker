'use client';

import { useCallback, useEffect, useRef, useState, startTransition } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/format-utils';
import { syncEngineEvents } from '@/lib/sync-engine';
import { getApplicationChangeFieldLabel, type ApplicationChangeField } from '@/types';

interface CheckLogEntry {
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

const LAST_SEEN_KEY = 'notif_last_seen';

function getLastSeen(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LAST_SEEN_KEY) ?? '';
}

export function NotificationsPanel() {
  const [open, setOpen]       = useState(false);
  const [entries, setEntries] = useState<ParsedCheckLogEntry[]>([]);
  const [unread, setUnread]   = useState(0);
  const panelRef              = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetch('/api/check-log?limit=60').then(r => r.json()) as CheckLogEntry[];
      const relevant = data
        .filter(e => e.result === 'changed' || e.result === 'error')
        .map(e => ({
          ...e,
          parsedChangedFields: (() => { try { return JSON.parse(e.changed_fields); } catch { return []; } })(),
        }));
      const lastSeen = getLastSeen();
      startTransition(() => {
        setEntries(relevant);
        setUnread(lastSeen
          ? relevant.filter(e => e.checked_at > lastSeen).length
          : Math.min(relevant.length, 9));
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

  function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setUnread(0);
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

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        aria-label="Уведомления"
        className="relative flex h-11 w-11 items-center justify-center rounded-[9px] transition hover:bg-[var(--panel)] active:scale-90 md:h-9 md:w-9"
        style={{ color: open ? 'var(--text)' : 'var(--text-muted)', background: open ? 'var(--panel)' : undefined }}
        title="История событий"
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
          className="fixed inset-x-3 top-[64px] z-50 overflow-hidden md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+8px)] md:w-[340px] rounded-[12px] animate-scale-in"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-float)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>История событий</h3>
            <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
              {entries.length}
            </span>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {entries.length === 0 ? (
              <p className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Событий пока нет
              </p>
            ) : entries.map(e => {
              const fields = e.parsedChangedFields;
              const isError   = e.result === 'error';
              const isChanged = fields.length > 0;
              const dotColor  = isError ? 'var(--danger)' : isChanged ? 'var(--warning)' : 'var(--success)';
              return (
                <Link
                  key={e.id}
                  href={`/applications/${e.application_id}`}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 border-b px-4 py-3 last:border-0 transition-colors hover:bg-[var(--panel)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                      № {e.application_number}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-[1.5]" style={{ color: 'var(--text-soft)' }}>
                      {isError
                        ? (e.error_message ?? 'Ошибка при проверке')
                        : isChanged
                          ? `Изменено: ${fields.map(f => getApplicationChangeFieldLabel(f as ApplicationChangeField)).join(', ')}`
                          : 'Проверка прошла успешно'}
                    </p>
                    <p className="mt-1 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(e.checked_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
