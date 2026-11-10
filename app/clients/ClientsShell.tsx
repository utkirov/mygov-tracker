'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { CLIENTS_CHANGED_EVENT } from '@/lib/client-events';
import { showToast } from '@/lib/toast';

interface ClientRow { id: string; name: string; phone: string; total: number; active: number }
interface Suggestion { name: string; applicationIds: string[] }

/** Clients: list with counts on the left, the card on the right (like Проекты). */
export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/clients', { cache: 'no-store' }).catch(() => null);
    const data = r?.ok ? await r.json() as { clients: ClientRow[]; suggestions: Suggestion[] } : { clients: [], suggestions: [] };
    startTransition(() => {
      setClients(data.clients);
      setSuggestions(data.suggestions);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(CLIENTS_CHANGED_EVENT, load);
    return () => window.removeEventListener(CLIENTS_CHANGED_EVENT, load);
  }, [load]);

  async function create(input: { name: string; phone?: string; applicationIds?: string[] }) {
    const r = await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await r.json().catch(() => ({})) as { client?: { id: string }; error?: string };
    if (!r.ok || !payload.client) {
      showToast({ title: 'Клиент не создан', description: payload.error, tone: 'error' });
      return;
    }
    setCreating(false);
    setName('');
    setPhone('');
    await load();
    router.push(`/clients/${payload.client.id}`);
  }

  const field = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };
  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:px-10 md:py-6">
        <aside className="shrink-0 rounded-[14px] border p-4 md:sticky md:top-0 md:w-[300px]" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="mb-3 flex items-center justify-between">
            <Link href="/clients" className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Клиенты</Link>
            <button type="button" aria-label="Новый клиент" onClick={() => setCreating(v => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] transition active:scale-95"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Plus size={16} />
            </button>
          </div>

          {creating && (
            <form className="mb-3 space-y-2" onSubmit={e => { e.preventDefault(); if (name.trim()) void create({ name, phone }); }}>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Имя или компания"
                className="w-full rounded-[8px] border px-3 py-2 text-[13px] outline-none" style={field} />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Телефон (необязательно)" inputMode="tel"
                className="w-full rounded-[8px] border px-3 py-2 text-[13px] outline-none" style={field} />
              <button type="submit" disabled={!name.trim()} className="w-full rounded-[8px] py-2 text-[12px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>Создать</button>
            </form>
          )}

          {!loaded ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 rounded-[8px] animate-shimmer" />)}</div>
          ) : clients.length === 0 ? (
            <p className="py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>Клиентов пока нет. Нажмите «+» или примите предложение ниже.</p>
          ) : (
            <nav className="flex flex-col gap-1">
              {clients.map(c => {
                const active = pathname === `/clients/${c.id}`;
                return (
                  <Link key={c.id} href={`/clients/${c.id}`}
                    className="flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13px] transition hover:bg-[var(--panel)]"
                    style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--text)' }}>
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.active ? `${c.active} / ` : ''}{c.total}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {suggestions.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Найдены в названиях заявлений</p>
              <ul className="mt-2 space-y-1.5">
                {suggestions.slice(0, 12).map(s => (
                  <li key={s.name} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate" style={{ color: 'var(--text-soft)' }}>{s.name} · {s.applicationIds.length}</span>
                    <button type="button" onClick={() => void create({ name: s.name, applicationIds: s.applicationIds })}
                      className="shrink-0 font-medium" style={{ color: 'var(--accent)' }}>Создать</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
