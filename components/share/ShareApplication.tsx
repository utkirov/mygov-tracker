import { StageStepper } from '@/components/StageStepper';
import type { ShareView } from '@/lib/share-links';

const STATUS_COLOR = { action_required: 'var(--danger)', in_progress: 'var(--warning)', completed: 'var(--success)' } as const;
const ORG_COLOR = { ok: 'var(--success)', bad: 'var(--danger)', other: 'var(--text-muted)', wait: 'var(--border-strong)' } as const;

export function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = /^\d{4}-\d{2}-\d{2}\s/.test(value) ? value.replace(' ', 'T') : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border p-4 md:p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {title && <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>}
      {children}
    </section>
  );
}

/** Status, stepper, verdict, approvals, documents and history of one application on a share page. */
export function ShareApplicationDetails({ view, docHref }: { view: ShareView; docHref: (file: string) => string }) {
  const c = view.checklist;
  return (
    <div className="space-y-4">
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

      {c && c.progress.length > 0 && <Card title="Ход рассмотрения"><StageStepper checklist={c} /></Card>}

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
                <a href={docHref(d.file)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>
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
    </div>
  );
}

export const statusDot = (view: ShareView) => STATUS_COLOR[view.status_type];
