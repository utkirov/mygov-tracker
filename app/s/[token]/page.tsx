import type { Metadata } from 'next';
import { connection } from 'next/server';

import { StageStepper } from '@/components/StageStepper';
import { buildShareView, findShareLink, isShareLinkActive } from '@/lib/share-links';

export const metadata: Metadata = {
  title: 'Статус заявления',
  robots: { index: false, follow: false },
};

const STATUS_COLOR = { action_required: 'var(--danger)', in_progress: 'var(--warning)', completed: 'var(--success)' } as const;
const ORG_COLOR = { ok: 'var(--success)', bad: 'var(--danger)', other: 'var(--text-muted)', wait: 'var(--border-strong)' } as const;

function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = /^\d{4}-\d{2}-\d{2}\s/.test(value) ? value.replace(' ', 'T') : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh" style={{ background: 'var(--bg)' }}>
      {/* The page refreshes itself so an open tab stays current. */}
      <meta httpEquiv="refresh" content="300" />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border p-4 md:p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {title && <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>}
      {children}
    </section>
  );
}

/**
 * Public, read-only status page behind a client share link (lib/share-links.ts).
 * No login; works until the link expires or is revoked.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const link = await findShareLink(token, { countView: true });
  const view = link && isShareLinkActive(link) ? await buildShareView(link) : null;

  if (!link || !view) {
    const expired = link && !isShareLinkActive(link);
    return (
      <Shell>
        <Card>
          <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
            {expired ? (link.revoked_at ? 'Ссылка отозвана' : 'Срок действия ссылки истёк') : 'Ссылка не найдена'}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>Попросите отправителя прислать новую ссылку.</p>
        </Card>
      </Shell>
    );
  }

  const c = view.checklist;
  return (
    <Shell>
      <div className="space-y-4">
        <header>
          <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>my.gov.uz · заявление № {view.application_number}</p>
          <h1 className="mt-1 text-[22px] font-bold leading-[1.25]" style={{ color: 'var(--text)' }}>{view.title}</h1>
          {view.title !== view.service_name && <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>{view.service_name}</p>}
          {view.organization && <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>{view.organization}</p>}
        </header>

        <Card>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[view.status_type] }} />
              {view.status}
            </span>
            {view.current_action && <span className="text-[13px]" style={{ color: 'var(--text-soft)' }}>{view.current_action}</span>}
          </div>
          <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-3">
            <div><dt style={{ color: 'var(--text-muted)' }}>Подано</dt><dd style={{ color: 'var(--text)' }}>{fmt(view.submission_date)}</dd></div>
            <div><dt style={{ color: 'var(--text-muted)' }}>Последнее изменение</dt><dd style={{ color: 'var(--text)' }}>{fmt(view.last_changed_date)}</dd></div>
            <div><dt style={{ color: 'var(--text-muted)' }}>Данные обновлены</dt><dd style={{ color: 'var(--text)' }}>{fmt(view.last_checked_at)}</dd></div>
          </dl>
        </Card>

        {c && c.progress.length > 0 && (
          <Card title="Ход рассмотрения"><StageStepper checklist={c} /></Card>
        )}

        {c?.result && (
          <Card title={c.result.kind === 'rejected' ? 'Отказ' : 'Заключение выдано'}>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {[c.result.number && `№ ${c.result.number}`, fmt(c.result.date)].filter(Boolean).join(' · ')}
            </p>
            {c.result.criteria.filter(k => k.status === 'bad').map(k => (
              <p key={k.label} className="mt-2 text-[13px]" style={{ color: 'var(--danger)' }}>✕ {k.label}</p>
            ))}
            {c.result.texts.map((t, i) => (
              <details key={i} className="mt-2 rounded-[8px] p-2.5" style={{ background: 'var(--panel)' }} open={i === 0}>
                <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{t.label}</summary>
                <p className="mt-1.5 whitespace-pre-line text-[12px] leading-[1.55]" style={{ color: 'var(--text-soft)' }}>{t.text}</p>
              </details>
            ))}
          </Card>
        )}

        {c && c.counts.total > 0 && (
          <Card title={`Согласования · ${c.counts.ok} из ${c.counts.total}`}>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {c.orgs.map(o => (
                <li key={o.name} className="flex items-start gap-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
                  <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: ORG_COLOR[o.status] }} />
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>{o.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {o.status === 'wait' ? 'Ожидается ответ' : [o.verdict, o.date].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {view.documents.length > 0 && (
          <Card title="Документы результата">
            <ul className="space-y-1.5">
              {view.documents.map(d => (
                <li key={d.file}>
                  <a href={`/s/${token}/doc/${d.file}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>
                    {d.title} · PDF {Math.max(1, Math.round(d.size / 1024))} КБ
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {view.history.length > 0 && (
          <Card title="История статусов">
            <ul className="space-y-1.5">
              {view.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-3 text-[12px]">
                  <span style={{ color: 'var(--text)' }}>{h.status}{h.current_action ? <span style={{ color: 'var(--text-muted)' }}> · {h.current_action}</span> : null}</span>
                  <span className="shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{fmt(h.recorded_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <p className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {link.expires_at ? `Ссылка действует до ${fmt(link.expires_at)}` : 'Бессрочная ссылка'} · данные обновляются автоматически
        </p>
      </div>
    </Shell>
  );
}
