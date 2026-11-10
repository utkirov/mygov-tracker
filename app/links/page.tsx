'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { ShareDesignPicker } from '@/components/detail/ShareDesignPicker';
import { DURATIONS, Views, when } from '@/components/detail/ShareSection';
import { showToast } from '@/lib/toast';

interface LinkRow {
  token: string;
  url: string;
  label: string;
  show_documents: boolean;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  views: number;
  last_viewed_at: string | null;
  active: boolean;
  has_pin: boolean;
  subscribers: number;
  target: { kind: 'application' | 'client'; id: string; title: string; number: string };
}

type Filter = 'active' | 'expiring' | 'unopened' | 'expired' | 'revoked' | 'all';

const DAY = 24 * 60 * 60_000;

function state(l: LinkRow): 'active' | 'expired' | 'revoked' {
  return l.revoked_at ? 'revoked' : l.active ? 'active' : 'expired';
}

const expiresSoon = (l: LinkRow) => l.active && !!l.expires_at && Date.parse(l.expires_at) - Date.now() < DAY;

function left(expires: string | null): string {
  if (!expires) return 'бессрочно';
  const ms = Date.parse(expires) - Date.now();
  if (ms <= 0) return `истекла ${when(expires)}`;
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return `ещё ${Math.max(1, Math.round(ms / 60_000))} мин`;
  if (h < 48) return `ещё ${h} ч`;
  return `до ${when(expires)}`;
}

/** Every client link in one place: who it's for, views, expiry — copy, extend, revoke. */
export default function LinksPage() {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [openViews, setOpenViews] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/share-links', { cache: 'no-store' }).catch(() => null);
    const data = r?.ok ? ((await r.json()) as { links: LinkRow[] }).links : [];
    startTransition(() => setLinks(data));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const all = links ?? [];
    return {
      active: all.filter(l => state(l) === 'active').length,
      expiring: all.filter(expiresSoon).length,
      unopened: all.filter(l => l.active && l.views === 0).length,
      expired: all.filter(l => state(l) === 'expired').length,
      revoked: all.filter(l => state(l) === 'revoked').length,
      all: all.length,
      views: all.reduce((n, l) => n + l.views, 0),
      subscribers: all.filter(l => l.active).reduce((n, l) => n + l.subscribers, 0),
    };
  }, [links]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (links ?? []).filter(l => {
      if (filter === 'expiring' && !expiresSoon(l)) return false;
      if (filter === 'unopened' && !(l.active && l.views === 0)) return false;
      if ((filter === 'active' || filter === 'expired' || filter === 'revoked') && state(l) !== filter) return false;
      return !q || [l.label, l.target.title, l.target.number].join(' ').toLowerCase().includes(q);
    });
  }, [links, filter, query]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ title: 'Ссылка скопирована', tone: 'success' });
    } catch {
      showToast({ title: 'Скопируйте вручную', description: url, tone: 'warning' });
    }
  }

  async function extend(token: string, minutes: number | null) {
    setBusy(token);
    try {
      const r = await fetch(`/api/share-links/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      const payload = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(payload.error ?? 'Не удалось продлить');
      showToast({ title: minutes === null ? 'Ссылка теперь бессрочная' : 'Ссылка продлена', tone: 'success' });
      await load();
    } catch (error) {
      showToast({ title: 'Не продлено', description: error instanceof Error ? error.message : '', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function revoke(l: LinkRow) {
    if (!window.confirm(`Отозвать ссылку${l.label ? ` «${l.label}»` : ''}? Она сразу перестанет открываться.`)) return;
    setBusy(l.token);
    await fetch(`/api/share-links/${l.token}`, { method: 'DELETE' }).catch(() => null);
    await load();
    setBusy(null);
  }

  const chips: Array<{ id: Filter; label: string }> = [
    { id: 'active', label: `Активные ${counts.active}` },
    { id: 'expiring', label: `Истекают за сутки ${counts.expiring}` },
    { id: 'unopened', label: `Не открывали ${counts.unopened}` },
    { id: 'expired', label: `Истекшие ${counts.expired}` },
    { id: 'revoked', label: `Отозванные ${counts.revoked}` },
    { id: 'all', label: `Все ${counts.all}` },
  ];
  const field = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-4">
        <h1 className="text-[22px] font-bold text-[var(--text)]">Ссылки</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          {links === null ? 'Загрузка…' : `Активных: ${counts.active} · просмотров всего: ${counts.views} · подписаны в Telegram: ${counts.subscribers}`}
        </p>
      </header>

      <ShareDesignPicker previewUrl={(links ?? []).find(l => l.active && l.target.kind === 'application')?.url ?? (links ?? []).find(l => l.active)?.url ?? null} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map(c => (
          <button key={c.id} type="button" onClick={() => setFilter(c.id)}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium"
            style={filter === c.id ? { background: 'var(--text)', color: 'var(--surface)' } : { background: 'var(--panel)', color: 'var(--text-soft)' }}>
            {c.label}
          </button>
        ))}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Номер, объект, клиент, «для кого»"
          className="ml-auto h-9 w-full rounded-[8px] border px-3 text-[13px] outline-none sm:w-72" style={field} />
      </div>

      {links !== null && shown.length === 0 && (
        <p className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 text-[13px] text-[var(--text-muted)]">
          {links.length === 0
            ? 'Ссылок ещё нет. Создайте её в карточке заявления или клиента — блок «Ссылка для клиента».'
            : 'Ничего не найдено.'}
        </p>
      )}

      <ul className="space-y-2">
        {shown.map(l => {
          const s = state(l);
          const href = l.target.kind === 'client' ? `/clients/${l.target.id}` : `/applications/${l.target.id}`;
          return (
            <li key={l.token} className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4"
              style={{ opacity: s === 'active' ? 1 : 0.7 }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 sm:flex-1">
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">
                    {l.target.kind === 'client' ? 'Все заявления клиента' : `Заявление № ${l.target.number || '—'}`}
                    {l.label ? ` · для: ${l.label}` : ''}
                  </p>
                  <Link href={href} className="mt-0.5 block truncate text-[14px] font-semibold text-[var(--text)] hover:underline">
                    {l.target.title}
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">{l.url.replace(/^https?:\/\//, '')}</p>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    <span style={{ color: s === 'revoked' ? 'var(--danger)' : expiresSoon(l) ? 'var(--warning)' : undefined }}>
                      {s === 'revoked' ? `отозвана ${when(l.revoked_at)}` : left(l.expires_at)}
                    </span>
                    {' · '}
                    <button type="button" onClick={() => setOpenViews(openViews === l.token ? null : l.token)} className="underline decoration-dotted">
                      {l.views ? `просмотров: ${l.views} · аналитика` : 'не открывали'}
                    </button>
                    {l.last_viewed_at ? ` · последний ${when(l.last_viewed_at)}` : ''}
                    {l.subscribers ? ` · в Telegram: ${l.subscribers}` : ''}
                    {l.has_pin ? ' · с PIN' : ''}
                    {l.show_documents ? ' · с документами' : ''}
                    {` · создана ${when(l.created_at)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 text-[12px] font-medium">
                  {s === 'active' && (
                    <>
                      <button type="button" onClick={() => void copy(l.url)} style={{ color: 'var(--accent)' }}>Копировать</button>
                      <a href={`${l.url}?own=1`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Открыть</a>
                    </>
                  )}
                  {s !== 'revoked' && (
                    <select value="" disabled={busy === l.token} aria-label="Продлить"
                      onChange={e => { if (e.target.value) void extend(l.token, e.target.value === 'forever' ? null : Number(e.target.value)); }}
                      className="h-8 rounded-[8px] border px-2 text-[12px]" style={field}>
                      <option value="">{s === 'expired' ? 'Возобновить…' : 'Продлить…'}</option>
                      {DURATIONS.map(d => <option key={d.label} value={d.minutes === null ? 'forever' : d.minutes}>{d.label}</option>)}
                    </select>
                  )}
                  {s === 'active' && (
                    <button type="button" onClick={() => void revoke(l)} disabled={busy === l.token} style={{ color: 'var(--danger)' }}>Отозвать</button>
                  )}
                </div>
              </div>
              {openViews === l.token && <Views token={l.token} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
