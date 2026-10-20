'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import type { ClientStats } from '@/lib/analytics';
import { CLIENTS_CHANGED_EVENT } from '@/lib/client-events';
import { showToast } from '@/lib/toast';
import { getMyGovStatus, type Application } from '@/types';

const ShareSection = dynamic(() => import('@/components/detail/ShareSection'), { ssr: false });

interface ClientCard {
  client: { id: string; name: string; phone: string; note: string };
  applications: Application[];
  stats: ClientStats | null;
}

function days(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 24))} ч`;
  const v = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(v).replace('.', ',')} дн`;
}

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClientCard | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [all, setAll] = useState<Application[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${id}`, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) { startTransition(() => setMissing(true)); return; }
    const card = await r.json() as ClientCard;
    startTransition(() => {
      setData(card);
      setForm({ name: card.client.name, phone: card.client.phone, note: card.client.note });
    });
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function loadAll() {
    const [a, b] = await Promise.all([
      fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
      fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
    ]);
    startTransition(() => setAll([...a, ...b]));
  }

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter(a => a.client?.id !== id)
      .filter(a => !q || `${a.object_name} ${a.service_name} ${a.application_number}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [all, query, id]);

  async function save() {
    const r = await fetch(`/api/clients/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!r.ok) { showToast({ title: 'Не сохранено', tone: 'error' }); return; }
    showToast({ title: 'Сохранено', tone: 'success' });
    window.dispatchEvent(new Event(CLIENTS_CHANGED_EVENT));
    await load();
  }

  async function remove() {
    if (!confirm('Удалить клиента? Заявления останутся, его ссылки перестанут работать.')) return;
    await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    window.dispatchEvent(new Event(CLIENTS_CHANGED_EVENT));
    router.push('/clients');
  }

  async function attach() {
    await fetch(`/api/clients/${id}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationIds: [...picked] }) });
    setPicked(new Set());
    setAll([]);
    window.dispatchEvent(new Event(CLIENTS_CHANGED_EVENT));
    await load();
  }

  async function detach(appId: string) {
    await fetch(`/api/applications/${appId}/client`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: null }) });
    window.dispatchEvent(new Event(CLIENTS_CHANGED_EVENT));
    await load();
  }

  if (missing) return <p className="p-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>Клиент не найден.</p>;
  if (!data) return <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 rounded-[14px] animate-shimmer" />)}</div>;

  const s = data.stats;
  const active = data.applications.filter(a => !a.archived);
  const done = data.applications.filter(a => a.archived);
  const field = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };
  const card = 'rounded-[14px] border p-4 md:p-5';
  const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' };

  const AppRow = ({ a }: { a: Application }) => (
    <li className="border-t py-3 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/applications/${a.id}`} className="text-[13px] font-semibold hover:underline" style={{ color: 'var(--text)' }}>
            {a.object_name || a.service_name || `№ ${a.application_number}`}
          </Link>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            № {a.application_number} · {getMyGovStatus(a.status).label}
            {a.checklist_summary?.stage && !a.archived ? ` · этап ${a.checklist_summary.stageIndex} из ${a.checklist_summary.stageCount}: ${a.checklist_summary.stage}` : ''}
          </p>
          {a.forecast?.pace === 'slow' && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--warning)' }}>Дольше обычного: {a.forecast.reason}</p>}
          {a.forecast?.pace === 'on_track' && a.forecast.expectedAt && (
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>Ожидается к {new Date(a.forecast.expectedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</p>
          )}
        </div>
        <button type="button" onClick={() => void detach(a.id)} className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>Отвязать</button>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <section className={card} style={cardStyle}>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Имя"
            className="h-10 rounded-[8px] border px-3 text-[15px] font-semibold outline-none" style={field} />
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Телефон" inputMode="tel"
            className="h-10 rounded-[8px] border px-3 text-[13px] outline-none" style={field} />
        </div>
        <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Заметка (видна только вам)" rows={2}
          className="mt-2 w-full rounded-[8px] border px-3 py-2 text-[13px] outline-none" style={field} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save()} className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: 'var(--text)', color: 'var(--surface)' }}>Сохранить</button>
          {data.client.phone && <a href={`tel:${data.client.phone.replace(/[^\d+]/g, '')}`} className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>Позвонить</a>}
          <button type="button" onClick={() => void remove()} className="ml-auto text-[12px]" style={{ color: 'var(--danger)' }}>Удалить клиента</button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Заявлений', String(s?.total ?? data.applications.length)],
          ['В работе', String(s?.active ?? active.length)],
          ['Одобрено', s?.approvalRate === null || !s ? '—' : `${s.approvalRate}% (${s.approved}/${s.approved + s.rejected})`],
          ['Срок до решения', days(s?.duration?.median)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[12px] border p-3" style={cardStyle}>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="mt-1 text-[17px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
          </div>
        ))}
      </div>

      <section className={card} style={cardStyle}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>В работе · {active.length}</h2>
        {active.length === 0 ? <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>Нет активных заявлений</p> : (
          <ul className="mt-1">
            {active.map(a => <AppRow key={a.id} a={a} />)}
          </ul>
        )}
      </section>

      <ShareSection clientId={id} defaultLabel={data.client.name} />

      <section className={card} style={cardStyle}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Привязать заявления</h2>
          {all.length === 0 && <button type="button" onClick={() => void loadAll()} className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>Выбрать из списка</button>}
        </div>
        {all.length > 0 && (
          <>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск: название, услуга, номер"
              className="mt-3 h-9 w-full rounded-[8px] border px-3 text-[13px] outline-none" style={field} />
            <ul className="mt-2 max-h-72 overflow-y-auto">
              {candidates.map(a => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-start gap-2 py-1.5 text-[12px]">
                    <input type="checkbox" className="mt-0.5" checked={picked.has(a.id)}
                      onChange={e => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                    <span style={{ color: 'var(--text)' }}>
                      {a.object_name || a.service_name}
                      <span style={{ color: 'var(--text-muted)' }}> · № {a.application_number}{a.client ? ` · сейчас у «${a.client.name}»` : ''}{a.archived ? ' · архив' : ''}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" disabled={picked.size === 0} onClick={() => void attach()}
              className="mt-2 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--text)', color: 'var(--surface)' }}>Привязать ({picked.size})</button>
          </>
        )}
      </section>

      {done.length > 0 && (
        <details className={card} style={cardStyle}>
          <summary className="cursor-pointer text-sm font-bold" style={{ color: 'var(--text)' }}>Завершённые · {done.length}</summary>
          <ul className="mt-1">{done.map(a => <AppRow key={a.id} a={a} />)}</ul>
        </details>
      )}

    </div>
  );
}
