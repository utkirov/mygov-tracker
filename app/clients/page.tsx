'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { Analytics } from '@/lib/analytics';
import { phoneHref, telegramHref } from '@/lib/client-contact';
import { CLIENTS_CHANGED_EVENT } from '@/lib/client-events';

interface ClientRow {
  id: string; name: string; phone: string; telegram?: string; total: number; active: number; last_change_at: string | null;
  links?: { active: number; views: number; last_viewed_at: string | null };
}

function days(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 24))} ч`;
  const v = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(v).replace('.', ',')} дн`;
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—');

/** /clients: a card per client — contacts, what is in work, terms and how the client reads their links. */
export default function ClientsOverview() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [stats, setStats] = useState<Analytics['clients']>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = () => {
      fetch('/api/clients', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then((d: { clients: ClientRow[] } | null) => startTransition(() => setClients(d?.clients ?? [])))
        .catch(() => startTransition(() => setClients([])));
      fetch('/api/analytics', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then((a: Analytics | null) => startTransition(() => setStats(a?.clients ?? [])))
        .catch(() => undefined);
    };
    load();
    window.addEventListener(CLIENTS_CHANGED_EVENT, load);
    return () => window.removeEventListener(CLIENTS_CHANGED_EVENT, load);
  }, []);

  const byId = useMemo(() => new Map(stats.map(s => [s.clientId, s])), [stats]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter(c => !q || [c.name, c.phone, c.telegram ?? ''].join(' ').toLowerCase().includes(q));
  }, [clients, query]);

  const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>Клиенты</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {clients === null ? 'Загрузка…' : `${clients.length} клиентов · в работе заявлений: ${clients.reduce((n, c) => n + c.active, 0)}`}
          </p>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Имя, телефон, Telegram"
          className="h-9 w-full rounded-[8px] border px-3 text-[13px] outline-none sm:w-64" style={{ ...cardStyle, color: 'var(--text)' }} />
      </div>

      {clients === null ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-36 rounded-[14px] animate-shimmer" />)}</div>
      ) : clients.length === 0 ? (
        <p className="mt-4 rounded-[14px] border p-5 text-[13px]" style={{ ...cardStyle, color: 'var(--text-muted)' }}>
          Пока никто не привязан. Создайте клиента слева или в карточке заявления (вкладка «Клиент и ссылки»).
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {shown.map(c => {
            const s = byId.get(c.id);
            const tel = phoneHref(c.phone);
            const tg = telegramHref(c.telegram, c.phone);
            return (
              <article key={c.id} className="rounded-[14px] border p-4" style={cardStyle}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/clients/${c.id}`} className="block truncate text-[15px] font-bold hover:underline" style={{ color: 'var(--text)' }}>{c.name}</Link>
                    <p className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {[c.phone, c.telegram ? `@${c.telegram}` : ''].filter(Boolean).join(' · ') || 'контакты не указаны'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-[12px] font-semibold">
                    {tel && <a href={tel} className="rounded-[8px] px-2.5 py-1.5" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Позвонить</a>}
                    {tg && <a href={tg} target="_blank" rel="noopener noreferrer" className="rounded-[8px] px-2.5 py-1.5" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Telegram</a>}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div className="rounded-[10px] p-2.5" style={{ background: 'var(--panel)' }}>
                    <dt style={{ color: 'var(--text-muted)' }}>В работе</dt>
                    <dd className="mt-0.5 text-[17px] font-bold tabular-nums" style={{ color: s?.slow ? 'var(--warning)' : 'var(--text)' }}>{c.active}<span className="text-[12px] font-normal" style={{ color: 'var(--text-muted)' }}> из {c.total}</span></dd>
                  </div>
                  <div className="rounded-[10px] p-2.5" style={{ background: 'var(--panel)' }}>
                    <dt style={{ color: 'var(--text-muted)' }}>Одобрено</dt>
                    <dd className="mt-0.5 text-[17px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{s && s.approved + s.rejected > 0 ? `${s.approved}/${s.approved + s.rejected}` : '—'}</dd>
                  </div>
                  <div className="rounded-[10px] p-2.5" style={{ background: 'var(--panel)' }}>
                    <dt style={{ color: 'var(--text-muted)' }}>Срок</dt>
                    <dd className="mt-0.5 text-[17px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{days(s?.duration?.median)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {s?.slow ? <span style={{ color: 'var(--warning)' }}>Дольше обычного: {s.slow} · </span> : null}
                  Последнее событие {when(c.last_change_at)}
                  {c.links && (c.links.active > 0 || c.links.views > 0)
                    ? ` · ссылок: ${c.links.active} · открытий: ${c.links.views}${c.links.last_viewed_at ? ` (последнее ${when(c.links.last_viewed_at)})` : ''}`
                    : ' · ссылку не отправляли'}
                </p>
              </article>
            );
          })}
          {shown.length === 0 && <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Ничего не найдено.</p>}
        </div>
      )}
    </div>
  );
}
