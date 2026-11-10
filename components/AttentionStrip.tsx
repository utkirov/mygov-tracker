'use client';

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';

interface Item { applicationId: string; application_number: string; title: string; elapsedDays: number; overdueDays: number | null; stage: string }
interface Waiting { applicationId: string; application_number: string; title: string; attempts: number; daysSinceRejection: number | null }
interface Reminder { id: string; applicationId: string; title: string; text: string; remind_on: string | null }
interface Attention { slow: Item[]; stale: Item[]; awaiting: Waiting[]; reminders?: Reminder[] }

type Group = 'slow' | 'awaiting' | 'stale' | 'reminders';

function days(v: number | null): string {
  if (v === null) return '—';
  if (v < 1) return `${Math.max(1, Math.round(v * 24))} ч`;
  return `${String(v < 10 ? Math.round(v * 10) / 10 : Math.round(v)).replace('.', ',')} дн`;
}

/** «Требует внимания» on the board: three counters, a click opens the list (/api/attention). */
export function AttentionStrip() {
  const [data, setData] = useState<Attention | null>(null);
  const [open, setOpen] = useState<Group | null>(null);

  useEffect(() => {
    fetch('/api/attention', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Attention | null) => { if (d) startTransition(() => setData(d)); })
      .catch(() => undefined);
  }, []);

  const reminders = data?.reminders ?? [];
  if (!data || data.slow.length + data.awaiting.length + data.stale.length + reminders.length === 0) return null;
  const groups: Array<{ id: Group; label: string; count: number; color: string }> = [
    { id: 'reminders', label: 'Напоминания', count: reminders.length, color: 'var(--accent)' },
    { id: 'slow', label: 'Дольше обычного', count: data.slow.length, color: 'var(--warning)' },
    { id: 'awaiting', label: 'Отказ — ждёт новой подачи', count: data.awaiting.length, color: 'var(--danger)' },
    { id: 'stale', label: 'Зависли', count: data.stale.length, color: 'var(--text-muted)' },
  ];

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        <span className="shrink-0 text-[12px] font-semibold" style={{ color: 'var(--text-soft)' }}>Требует внимания:</span>
        {groups.filter(g => g.count > 0).map(g => (
          <button key={g.id} type="button" onClick={() => setOpen(open === g.id ? null : g.id)}
            className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium"
            style={open === g.id ? { background: 'var(--text)', color: 'var(--surface)' } : { background: 'var(--panel)', color: g.color }}>
            {g.label} · {g.count}
          </button>
        ))}
        <Link href="/analytics" className="shrink-0 text-[12px] font-medium" style={{ color: 'var(--accent)' }}>аналитика</Link>
      </div>
      {open && (
        <ul className="mt-2 grid gap-x-6 gap-y-1.5 rounded-[10px] p-3 sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--panel)' }}>
          {open === 'reminders'
            ? reminders.map(r => (
              <li key={r.id} className="min-w-0 text-[12px]">
                <Link href={`/applications/${r.applicationId}?tab=notes`} className="block truncate font-semibold hover:underline" style={{ color: 'var(--text)' }}>{r.text}</Link>
                <span style={{ color: 'var(--text-muted)' }}>{r.title}{r.remind_on ? ` · на ${r.remind_on.slice(8, 10)}.${r.remind_on.slice(5, 7)}` : ''}</span>
              </li>
            ))
            : open === 'awaiting'
            ? data.awaiting.map(a => (
              <li key={a.applicationId} className="min-w-0 text-[12px]">
                <Link href={`/applications/${a.applicationId}`} className="block truncate font-semibold hover:underline" style={{ color: 'var(--text)' }}>{a.title}</Link>
                <span style={{ color: 'var(--text-muted)' }}>отказ {a.daysSinceRejection === null ? '—' : `${days(a.daysSinceRejection)} назад`} · подач: {a.attempts} · </span>
                <Link href={`/add?parent_id=${a.applicationId}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>подать повторно</Link>
              </li>
            ))
            : (open === 'slow' ? data.slow : data.stale).map(f => (
              <li key={f.applicationId} className="min-w-0 text-[12px]">
                <Link href={`/applications/${f.applicationId}`} className="block truncate font-semibold hover:underline" style={{ color: 'var(--text)' }}>{f.title}</Link>
                <span style={{ color: 'var(--text-muted)' }}>идёт {days(f.elapsedDays)}{f.overdueDays ? ` · сверх срока ${days(f.overdueDays)}` : ''}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
