'use client';

import { startTransition, useEffect, useState } from 'react';
import Link from 'next/link';

import { showToast } from '@/lib/toast';

interface ClientOption { id: string; name: string; total: number }

/** «Клиент»: which client the application is for (lib/clients.ts); resubmissions inherit it. */
export function ClientPicker({ applicationId, client, onChange }: {
  applicationId: string;
  client: { id: string; name: string } | null | undefined;
  onChange: (client: { id: string; name: string } | null) => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/clients', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { clients: [] }))
      .then((d: { clients: ClientOption[] }) => startTransition(() => setClients(d.clients)))
      .catch(() => {});
  }, []);

  async function assign(clientId: string | null) {
    const r = await fetch(`/api/applications/${applicationId}/client`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (!r.ok) {
      showToast({ title: 'Не удалось сохранить клиента', tone: 'error' });
      return;
    }
    onChange(clientId ? clients.find(c => c.id === clientId) ?? null : null);
  }

  async function create() {
    const r = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, applicationIds: [applicationId] }),
    });
    const payload = await r.json().catch(() => ({})) as { client?: ClientOption; error?: string };
    if (!r.ok || !payload.client) {
      showToast({ title: payload.error ?? 'Не удалось создать клиента', tone: 'error' });
      return;
    }
    setClients(prev => [...prev, { ...payload.client!, total: 1 }]);
    setCreating(false);
    setName('');
    onChange({ id: payload.client.id, name: payload.client.name });
  }

  const field = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Клиент</h2>
        {client && <Link href={`/clients/${client.id}`} className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>Карточка клиента</Link>}
      </div>
      {creating ? (
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя клиента" autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void create(); }}
            className="h-9 min-w-0 flex-1 rounded-[8px] border px-3 text-[13px] outline-none" style={field} />
          <button type="button" disabled={!name.trim()} onClick={() => void create()}
            className="rounded-[8px] px-3 text-[12px] font-semibold disabled:opacity-50" style={{ background: 'var(--text)', color: 'var(--surface)' }}>Создать</button>
          <button type="button" onClick={() => setCreating(false)} className="px-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>Отмена</button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <select value={client?.id ?? ''} onChange={e => void assign(e.target.value || null)}
            className="h-9 min-w-0 flex-1 rounded-[8px] border px-2 text-[13px]" style={field}>
            <option value="">Без клиента</option>
            {client && !clients.some(c => c.id === client.id) && <option value={client.id}>{client.name}</option>}
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={() => setCreating(true)} className="rounded-[8px] border px-3 text-[12px] font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}>Новый</button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">Повторные подачи этого заявления попадут к тому же клиенту автоматически.</p>
    </section>
  );
}
