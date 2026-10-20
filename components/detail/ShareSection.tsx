'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';

import { showToast } from '@/lib/toast';

interface ShareLink {
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
}

const DURATIONS: Array<{ minutes: number | null; label: string }> = [
  { minutes: 30, label: '30 минут' },
  { minutes: 60, label: '1 час' },
  { minutes: 24 * 60, label: '1 день' },
  { minutes: 7 * 24 * 60, label: '7 дней' },
  { minutes: 30 * 24 * 60, label: '30 дней' },
  { minutes: null, label: 'Бессрочно' },
];

function when(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Views({ token }: { token: string }) {
  const [views, setViews] = useState<Array<{ viewed_at: string; device: string }> | null>(null);
  useEffect(() => {
    fetch(`/api/share-links/${token}/views`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { views: [] }))
      .then((d: { views: Array<{ viewed_at: string; device: string }> }) => startTransition(() => setViews(d.views)))
      .catch(() => startTransition(() => setViews([])));
  }, [token]);
  if (!views) return <p className="mt-2 text-[11px] text-[var(--text-muted)]">Загрузка…</p>;
  if (views.length === 0) return <p className="mt-2 text-[11px] text-[var(--text-muted)]">Ещё не открывали</p>;
  return (
    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-[var(--text-soft)]">
      {views.map((v, i) => <li key={i} className="flex justify-between gap-3"><span>{v.device}</span><span className="font-mono text-[var(--text-muted)]">{when(v.viewed_at)}</span></li>)}
    </ul>
  );
}

/**
 * Client share links: a read-only status page that expires (lib/share-links.ts).
 * For one application (applicationId) or for all applications of a client (clientId).
 */
export default function ShareSection({ applicationId, clientId, defaultLabel = '' }: { applicationId?: string; clientId?: string; defaultLabel?: string }) {
  const base = clientId ? `/api/clients/${clientId}/share-links` : `/api/applications/${applicationId}/share-links`;
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [minutes, setMinutes] = useState<number | null>(clientId ? 30 * 24 * 60 : 24 * 60);
  const [label, setLabel] = useState(defaultLabel);
  const [pin, setPin] = useState('');
  const [showDocuments, setShowDocuments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openViews, setOpenViews] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(base, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const { links: next } = (await r.json()) as { links: ShareLink[] };
    startTransition(() => setLinks(next));
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  async function copy(url: string, withPin?: string) {
    const text = withPin ? `${url}\nPIN: ${withPin}` : url;
    try {
      await navigator.clipboard.writeText(text);
      showToast({ title: withPin ? 'Ссылка и PIN скопированы' : 'Ссылка скопирована', tone: 'success' });
    } catch {
      showToast({ title: 'Скопируйте вручную', description: text, tone: 'warning' });
    }
  }

  async function create() {
    if (pin && !/^\d{4,8}$/.test(pin)) {
      showToast({ title: 'PIN — от 4 до 8 цифр', tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes, label, showDocuments, pin }),
      });
      const payload = await r.json().catch(() => ({})) as { link?: ShareLink; error?: string };
      if (!r.ok || !payload.link) throw new Error(payload.error ?? 'Не удалось создать ссылку');
      await load();
      await copy(payload.link.url, pin || undefined);
      setPin('');
    } catch (error) {
      showToast({ title: 'Ссылка не создана', description: error instanceof Error ? error.message : '', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    await fetch(`/api/share-links/${token}`, { method: 'DELETE' });
    await load();
  }

  const active = links.filter(l => l.active);
  const inactive = links.filter(l => !l.active).slice(0, 5);
  const field = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <h2 className="text-sm font-bold text-[var(--text)]">{clientId ? 'Ссылка на все заявления клиента' : 'Ссылка для клиента'}</h2>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
        Страница со статусом, этапами и согласованиями — без входа{clientId ? ', новые заявления клиента появляются в ней сами' : ''}.
        Пароль, телефоны, заметки и скриншот не показываются. Клиент может подписаться на обновления в Telegram.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select value={minutes === null ? 'forever' : String(minutes)}
          onChange={e => setMinutes(e.target.value === 'forever' ? null : Number(e.target.value))}
          className="h-9 rounded-[8px] border px-2 text-[13px]" style={field}>
          {DURATIONS.map(d => <option key={d.label} value={d.minutes === null ? 'forever' : d.minutes}>{d.label}</option>)}
        </select>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Для кого (необязательно)"
          className="h-9 rounded-[8px] border px-3 text-[13px] outline-none" style={field} />
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="PIN (необязательно)"
          inputMode="numeric" className="h-9 rounded-[8px] border px-3 text-[13px] outline-none" style={field} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
        <input type="checkbox" checked={showDocuments} onChange={e => setShowDocuments(e.target.checked)} />
        Показывать документы результата (решение, заключение)
      </label>
      <button type="button" onClick={() => void create()} disabled={busy}
        className="mt-3 rounded-[8px] px-3 py-2 text-[12px] font-semibold disabled:opacity-60"
        style={{ background: 'var(--text)', color: 'var(--surface)' }}>
        {busy ? 'Создаю…' : 'Создать и скопировать ссылку'}
      </button>

      {active.length > 0 && (
        <ul className="mt-4 space-y-2">
          {active.map(l => (
            <li key={l.token} className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12px] font-semibold text-[var(--text)]">{l.label || 'Ссылка'}{l.has_pin ? ' · с PIN' : ''}</p>
                <div className="flex shrink-0 gap-3 text-[11px] font-medium">
                  <button type="button" onClick={() => void copy(l.url)} style={{ color: 'var(--accent)' }}>Копировать</button>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Открыть</a>
                  <button type="button" onClick={() => void revoke(l.token)} style={{ color: 'var(--danger)' }}>Отозвать</button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {l.expires_at ? `до ${when(l.expires_at)}` : 'бессрочно'}
                {' · '}
                <button type="button" onClick={() => setOpenViews(openViews === l.token ? null : l.token)} className="underline decoration-dotted">
                  просмотров: {l.views}
                </button>
                {l.last_viewed_at ? ` · последний ${when(l.last_viewed_at)}` : ''}
                {l.subscribers ? ` · в Telegram: ${l.subscribers}` : ''}
                {l.show_documents ? ' · с документами' : ''}
              </p>
              {openViews === l.token && <Views token={l.token} />}
            </li>
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          Неактивные: {inactive.map(l => `${l.label || 'ссылка'} (${l.revoked_at ? 'отозвана' : 'истекла'})`).join(', ')}
        </p>
      )}
    </section>
  );
}
