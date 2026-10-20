'use client';

import { startTransition, useEffect, useState } from 'react';
import Link from 'next/link';

import type { Analytics } from '@/lib/analytics';

function days(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 24))} ч`;
  const v = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(v).replace('.', ',')} дн`;
}

/** /clients: every client's numbers side by side (lib/analytics.ts → clients). */
export default function ClientsOverview() {
  const [rows, setRows] = useState<Analytics['clients'] | null>(null);
  useEffect(() => {
    fetch('/api/analytics', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((a: Analytics | null) => startTransition(() => setRows(a?.clients ?? [])))
      .catch(() => startTransition(() => setRows([])));
  }, []);

  const th = 'px-2 py-1.5 text-left text-[11px] font-medium';
  const td = 'px-2 py-2 text-[12px] tabular-nums';
  return (
    <section className="rounded-[14px] border p-4 md:p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <h1 className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Клиенты — сводка</h1>
      <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Заявления по клиентам, доля одобрений и срок до решения. Клиенту можно отправить одну ссылку на все его заявления.
      </p>
      {rows === null ? (
        <div className="mt-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 rounded-[8px] animate-shimmer" />)}</div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Пока никто не привязан. Создайте клиента слева или в карточке заявления (блок «Клиент»).
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr style={{ color: 'var(--text-muted)' }}>
              <th className={th}>Клиент</th><th className={th}>Заявлений</th><th className={th}>В работе</th><th className={th}>Одобрено</th><th className={th}>Срок до решения</th>
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.clientId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-2 text-[13px] font-semibold"><Link href={`/clients/${c.clientId}`} className="hover:underline" style={{ color: 'var(--text)' }}>{c.name}</Link></td>
                  <td className={td} style={{ color: 'var(--text-muted)' }}>{c.total}</td>
                  <td className={td} style={{ color: c.slow ? 'var(--warning)' : 'var(--text)' }}>{c.active}{c.slow ? ` · ${c.slow} дольше обычного` : ''}</td>
                  <td className={td} style={{ color: 'var(--text)' }}>{c.approvalRate === null ? '—' : `${c.approvalRate}%`} <span style={{ color: 'var(--text-muted)' }}>{c.approved}/{c.approved + c.rejected}</span></td>
                  <td className={td} style={{ color: 'var(--text)' }}>{days(c.duration?.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
