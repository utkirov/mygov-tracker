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

/** Client share links: a read-only status page that expires (lib/share-links.ts). */
export default function ShareSection({ applicationId }: { applicationId: string }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [minutes, setMinutes] = useState<number | null>(24 * 60);
  const [label, setLabel] = useState('');
  const [showDocuments, setShowDocuments] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/applications/${applicationId}/share-links`, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const { links: next } = (await r.json()) as { links: ShareLink[] };
    startTransition(() => setLinks(next));
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ title: 'Ссылка скопирована', tone: 'success' });
    } catch {
      showToast({ title: 'Скопируйте вручную', description: url, tone: 'warning' });
    }
  }

  async function create() {
    setBusy(true);
    try {
      const r = await fetch(`/api/applications/${applicationId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes, label, showDocuments }),
      });
      const payload = await r.json().catch(() => ({})) as { link?: ShareLink; error?: string };
      if (!r.ok || !payload.link) throw new Error(payload.error ?? 'Не удалось создать ссылку');
      setLabel('');
      await load();
      await copy(payload.link.url);
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
      <h2 className="text-sm font-bold text-[var(--text)]">Ссылка для клиента</h2>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
        Страница со статусом, этапами и согласованиями — без входа. Пароль, телефоны, заметки и скриншот не показываются.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select value={minutes === null ? 'forever' : String(minutes)}
          onChange={e => setMinutes(e.target.value === 'forever' ? null : Number(e.target.value))}
          className="h-9 rounded-[8px] border px-2 text-[13px]" style={field}>
          {DURATIONS.map(d => <option key={d.label} value={d.minutes === null ? 'forever' : d.minutes}>{d.label}</option>)}
        </select>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Для кого (необязательно)"
          className="h-9 rounded-[8px] border px-3 text-[13px] outline-none" style={field} />
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
                <p className="truncate text-[12px] font-semibold text-[var(--text)]">{l.label || 'Ссылка'}</p>
                <div className="flex shrink-0 gap-3 text-[11px] font-medium">
                  <button type="button" onClick={() => void copy(l.url)} style={{ color: 'var(--accent)' }}>Копировать</button>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Открыть</a>
                  <button type="button" onClick={() => void revoke(l.token)} style={{ color: 'var(--danger)' }}>Отозвать</button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {l.expires_at ? `до ${when(l.expires_at)}` : 'бессрочно'} · просмотров: {l.views}
                {l.last_viewed_at ? ` · последний ${when(l.last_viewed_at)}` : ''}{l.show_documents ? ' · с документами' : ''}
              </p>
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
