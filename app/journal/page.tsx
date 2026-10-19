'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { describeEvent, type CheckLogEntry } from '@/components/NotificationsPanel';
import type { Application } from '@/types';

type Filter = 'all' | 'changed' | 'unchanged' | 'error';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'changed', label: 'Изменения' },
  { id: 'error', label: 'Ошибки' },
  { id: 'unchanged', label: 'Без изменений' },
];

/** «Открыть журнал проверок» from the notifications panel: every recent check, not only changes. */
export default function JournalPage() {
  const [entries, setEntries] = useState<CheckLogEntry[] | null>(null);
  const [apps, setApps] = useState<Map<string, Application>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const [log, active, archived] = await Promise.all([
      fetch('/api/check-log?limit=200', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<CheckLogEntry[]>,
      fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
      fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
    ]);
    const map = new Map<string, Application>();
    for (const a of [...(Array.isArray(active) ? active : []), ...(Array.isArray(archived) ? archived : [])]) map.set(a.id, a);
    startTransition(() => {
      setEntries(Array.isArray(log) ? log : []);
      setApps(map);
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (entries ?? []).filter(e => filter === 'all' || e.result === filter), [entries, filter]);

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6 md:py-8">
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>Журнал проверок</h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Последние 200 проверок. Проверки без изменений хранятся 30 дней, изменения и ошибки — 180.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="rounded-[7px] border px-2.5 py-1 text-[12px] font-medium"
              style={filter === f.id
                ? { background: 'var(--text)', color: 'var(--surface)', borderColor: 'var(--text)' }
                : { background: 'var(--surface)', color: 'var(--text-soft)', borderColor: 'var(--border)' }}>
              {f.label} · {(entries ?? []).filter(e => f.id === 'all' || e.result === f.id).length}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-[14px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          {entries === null ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-[8px] animate-shimmer" />)}</div>
          ) : shown.length === 0 ? (
            <p className="py-12 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Записей нет</p>
          ) : shown.map(e => {
            const app = apps.get(e.application_id);
            let fields: string[] = [];
            try { fields = JSON.parse(e.changed_fields) as string[]; } catch { fields = []; }
            const color = e.result === 'error' ? 'var(--danger)' : e.result === 'changed' ? 'var(--accent)' : 'var(--text-muted)';
            return (
              <Link key={e.id} href={`/applications/${e.application_id}`}
                className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0 transition hover:bg-[var(--panel)]"
                style={{ borderColor: 'var(--border)' }}>
                <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                    {app ? app.object_name || app.service_name : `№ ${e.application_number}`}
                  </p>
                  <p className="mt-0.5 text-[12px]" style={{ color: e.result === 'error' ? 'var(--danger)' : 'var(--text-soft)' }}>
                    {e.result === 'unchanged' ? 'Без изменений' : describeEvent(e, fields, app)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>№ {e.application_number}</p>
                  <p className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(e.checked_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
