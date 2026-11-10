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

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const duration = (m: number) => (m < 60 ? `${m} мин` : m < 1440 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${Math.floor(m / 1440)} дн ${Math.floor((m % 1440) / 60)} ч`);

/** «Открыть журнал проверок» from the notifications panel: every recent check, not only changes. */
export default function JournalPage() {
  const [entries, setEntries] = useState<CheckLogEntry[] | null>(null);
  const [apps, setApps] = useState<Map<string, Application>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<'all' | 'today' | 'week'>('all');
  const [downtimes, setDowntimes] = useState<Array<{ from: string; to: string; minutes: number }>>([]);

  const load = useCallback(async () => {
    const [log, active, archived] = await Promise.all([
      fetch('/api/check-log?limit=500', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<CheckLogEntry[]>,
      fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
      fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
    ]);
    const map = new Map<string, Application>();
    for (const a of [...(Array.isArray(active) ? active : []), ...(Array.isArray(archived) ? archived : [])]) map.set(a.id, a);
    const down = await fetch('/api/downtime', { cache: 'no-store' }).then(r => r.json()).catch(() => null) as { downtimes?: Array<{ from: string; to: string; minutes: number }> } | null;
    startTransition(() => {
      setDowntimes(down?.downtimes ?? []);
      setEntries(Array.isArray(log) ? log : []);
      setApps(map);
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Period and search narrow the list first; the result chips count what is left.
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    // eslint-disable-next-line react-hooks/purity -- the period is relative to now by definition
    const from = period === 'today' ? new Date().setHours(0, 0, 0, 0) : period === 'week' ? Date.now() - 7 * 86_400_000 : 0;
    return (entries ?? []).filter(e => {
      if (from && Date.parse(e.checked_at) < from) return false;
      if (!q) return true;
      const app = apps.get(e.application_id);
      return [e.application_number, app?.object_name ?? '', app?.service_name ?? ''].join(' ').toLowerCase().includes(q);
    });
  }, [entries, apps, query, period]);
  const shown = useMemo(() => scoped.filter(e => filter === 'all' || e.result === filter), [scoped, filter]);

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6 md:py-8">
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>Журнал проверок</h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Последние 500 проверок. Проверки без изменений хранятся 30 дней, изменения и ошибки — 180.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="rounded-[7px] border px-2.5 py-1 text-[12px] font-medium"
              style={filter === f.id
                ? { background: 'var(--text)', color: 'var(--surface)', borderColor: 'var(--text)' }
                : { background: 'var(--surface)', color: 'var(--text-soft)', borderColor: 'var(--border)' }}>
              {f.label} · {scoped.filter(e => f.id === 'all' || e.result === f.id).length}
            </button>
          ))}
          <select value={period} onChange={e => setPeriod(e.target.value as typeof period)} aria-label="Период"
            className="rounded-[7px] border px-2 py-1 text-[12px]" style={{ background: 'var(--surface)', color: 'var(--text-soft)', borderColor: 'var(--border)' }}>
            <option value="all">За всё время</option>
            <option value="today">Сегодня</option>
            <option value="week">7 дней</option>
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Номер или объект"
            className="ml-auto h-[28px] w-full rounded-[7px] border px-2.5 text-[12px] outline-none sm:w-56"
            style={{ background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' }} />
        </div>

        {downtimes.length > 0 && (
          <details className="mt-4 rounded-[14px] border px-4 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
              Простои сервера · {downtimes.length}
              <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>последний {when(downtimes[0].from)} — {duration(downtimes[0].minutes)}</span>
            </summary>
            <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>Компьютер с трекером был выключен или спал: проверки не шли, ссылки клиентов не открывались.</p>
            <ul className="mt-2 space-y-1 text-[12px]">
              {downtimes.slice(0, 20).map(d => (
                <li key={d.from} className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-soft)' }}>{when(d.from)} — {when(d.to)}</span>
                  <span className="font-mono" style={{ color: d.minutes >= 120 ? 'var(--danger)' : 'var(--text-muted)' }}>{duration(d.minutes)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

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
