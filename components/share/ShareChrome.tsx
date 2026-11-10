/**
 * TURON PROJECT frame of the public share page: the contact bar on top, the
 * summary card (looks C / D / F), the timeline card (look E), the call /
 * Telegram card and the owner's look switcher. Server components — no client JS.
 */
import { BRAND } from '@/lib/brand';
import { daysInWork, daysWord } from '@/lib/card-images';
import { isDarkLook, SHARE_DESIGNS, type ShareDesign } from '@/lib/share-design';
import type { ShareView } from '@/lib/share-links';

import { fmt, statusDot } from './ShareApplication';

function Mark({ size = 34 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[9px] font-extrabold text-white"
      style={{ width: size, height: size, background: BRAND.colors.violet, fontSize: size * 0.4 }}>
      {BRAND.mark}
    </span>
  );
}

/** Company name and contacts — always on top of the page. */
export function ContactBar({ design }: { design: ShareDesign }) {
  const dark = isDarkLook(design);
  const c = BRAND.colors;
  const link = 'inline-flex items-center gap-1.5 whitespace-nowrap hover:underline';
  return (
    <div className="relative overflow-hidden" style={{ background: dark ? c.ink2 : c.ink, color: c.cream, borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'transparent'}` }}>
      {dark && <div className="share-hero-glow pointer-events-none absolute inset-0" />}
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <a href={BRAND.site} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5">
          <Mark />
          <span className="leading-[1.15]">
            <span className="block text-[14px] font-bold tracking-[0.06em]">{BRAND.short}</span>
            <span className="block text-[11px]" style={{ color: c.muted }}>{BRAND.product}</span>
          </span>
        </a>
        <div className="flex flex-col gap-1 text-[12px] sm:items-end">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
            <a href={BRAND.phoneHref} className={link}><span style={{ color: c.violetLight }}>☎</span>{BRAND.phone}</a>
            <a href={BRAND.telegramUrl} target="_blank" rel="noopener noreferrer" className={link}><span style={{ color: c.violetLight }}>✈</span>{BRAND.telegram}</a>
            <a href={`mailto:${BRAND.email}`} className={`${link} hidden sm:inline-flex`}><span style={{ color: c.violetLight }}>@</span>{BRAND.email}</a>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: c.muted }}>
            <a href={BRAND.mapUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{BRAND.address}</a>
            <span>{BRAND.hours}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** «Есть вопросы?» — call or write, at the end of the page. */
export function ContactCard() {
  return (
    <section className="rounded-[14px] border p-4 md:p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Есть вопросы по заявлению?</p>
      <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{BRAND.company} · {BRAND.hours}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a href={BRAND.phoneHref} className="flex h-11 items-center justify-center rounded-[10px] text-[14px] font-semibold text-white" style={{ background: BRAND.colors.violet }}>
          Позвонить · {BRAND.phone}
        </a>
        <a href={BRAND.telegramUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-[10px] border text-[14px] font-semibold"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}>
          Написать в Telegram
        </a>
      </div>
    </section>
  );
}

// ── what the summary shows ──

interface Facts {
  days: number | null;
  steps: Array<{ title: string; state: 'done' | 'current' | 'pending'; date: string }>;
  stageNo: number;
  current: string;
  finished: boolean;
  rejected: boolean;
  approvals: { ok: number; total: number; bad: number } | null;
  lastEvent: { text: string; at: string } | null;
}

function facts(view: ShareView): Facts {
  const outcome = view.checklist?.outcome;
  const rejected = outcome === 'rejected';
  const finished = view.completed || outcome === 'approved' || rejected;
  const raw = (view.checklist?.progress ?? []).filter(s => s.state !== 'skipped');
  const steps = raw.map(s => ({ title: s.title, date: s.date, state: (finished && s.state !== 'pending' ? 'done' : s.state) as Facts['steps'][number]['state'] }));
  const currentIdx = steps.findIndex(s => s.state === 'current');
  const doneCount = steps.filter(s => s.state === 'done').length;
  const stageNo = finished ? steps.length : currentIdx >= 0 ? currentIdx + 1 : Math.min(doneCount + 1, steps.length);
  const current = finished
    ? (rejected ? 'Отказ' : 'Рассмотрение завершено')
    : steps[currentIdx]?.title || view.current_action || '';
  const counts = view.checklist?.counts;
  const h = view.history[0];
  return {
    days: daysInWork(view.submission_date?.replace(' ', 'T'), view.completed ? view.last_changed_date?.replace(' ', 'T') : null),
    steps, stageNo, current, finished, rejected,
    approvals: counts && counts.total > 0 ? { ok: counts.ok, total: counts.total, bad: counts.bad } : null,
    lastEvent: h ? { text: [h.status, h.current_action].filter(Boolean).join(' · '), at: h.recorded_at } : null,
  };
}

function StatusPill({ view, onBrand }: { view: ShareView; onBrand?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold"
      style={onBrand ? { background: 'rgba(255,255,255,0.16)', color: '#fff' } : { background: 'var(--panel)', color: 'var(--text)' }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: onBrand ? '#fff' : statusDot(view) }} />
      {view.status}
    </span>
  );
}

/** One segment per stage: done, now (pulsing), ahead. */
function StageBar({ f }: { f: Facts }) {
  if (f.steps.length === 0) return null;
  return (
    <div className="flex gap-1" aria-label={`Этап ${f.stageNo} из ${f.steps.length}`}>
      {f.steps.map((s, i) => (
        <span key={i} title={s.title} className={`h-2 flex-1 rounded-full ${s.state === 'current' ? 'animate-pulse' : ''}`}
          style={{ background: s.state === 'done' ? (f.rejected && i === f.steps.length - 1 ? 'var(--danger)' : BRAND.colors.violet) : s.state === 'current' ? BRAND.colors.violetLight : 'var(--panel)' }} />
      ))}
    </div>
  );
}

/** Looks C / D / F: everything a client asks first, in one card. F has the violet Turon header. */
export function SummaryHero({ view, brand = false }: { view: ShareView; brand?: boolean }) {
  const f = facts(view);
  const kpis = [
    { label: f.finished ? 'Шло' : 'В работе', value: f.days === null ? '—' : String(f.days), unit: f.days === null ? '' : daysWord(f.days) },
    { label: 'Этап', value: f.steps.length ? String(f.stageNo) : '—', unit: f.steps.length ? `из ${f.steps.length}` : '' },
    f.approvals
      ? { label: 'Согласования', value: `${f.approvals.ok}/${f.approvals.total}`, unit: f.approvals.bad ? `отказ: ${f.approvals.bad}` : f.approvals.ok === f.approvals.total ? 'все получены' : 'получено' }
      : { label: 'Изменено', value: fmt(view.last_changed_date).slice(0, 5), unit: fmt(view.last_changed_date).slice(6, 10) },
  ];
  const head = (
    <>
      <p className="text-[12px] font-medium" style={{ color: brand ? 'rgba(255,255,255,0.72)' : 'var(--text-muted)' }}>Заявление № {view.application_number}</p>
      <h2 className="mt-1 text-[20px] font-bold leading-[1.25] md:text-[24px]" style={{ color: brand ? '#fff' : 'var(--text)' }}>{view.title}</h2>
      {view.organization && <p className="mt-0.5 text-[12px]" style={{ color: brand ? 'rgba(255,255,255,0.72)' : 'var(--text-muted)' }}>{view.organization}</p>}
      <div className="mt-3"><StatusPill view={view} onBrand={brand} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {kpis.map(k => (
          <div key={k.label} className="min-w-0 rounded-[12px] p-2.5 sm:p-3" style={{ background: brand ? 'rgba(255,255,255,0.12)' : 'var(--panel)' }}>
            <p className="truncate text-[9px] font-semibold uppercase sm:text-[10px]" style={{ color: brand ? 'rgba(255,255,255,0.72)' : 'var(--text-muted)' }}>{k.label}</p>
            <p className="mt-1 text-[24px] font-bold leading-none md:text-[28px]" style={{ color: brand ? '#fff' : 'var(--text)' }}>{k.value}</p>
            <p className="mt-1 text-[11px]" style={{ color: brand ? 'rgba(255,255,255,0.72)' : 'var(--text-muted)' }}>{k.unit}</p>
          </div>
        ))}
      </div>
    </>
  );
  return (
    <section className="overflow-hidden rounded-[18px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {brand ? (
        <div className="p-4 md:p-6" style={{ background: `linear-gradient(135deg, ${BRAND.colors.violet} 0%, ${BRAND.colors.violetDeep} 100%)` }}>{head}</div>
      ) : (
        <div className="px-4 pt-4 md:px-6 md:pt-6">{head}</div>
      )}
      <div className="space-y-3 p-4 md:px-6 md:pb-6">
        <StageBar f={f} />
        <div className="space-y-1.5 text-[13px]">
          <p style={{ color: 'var(--text-soft)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Сейчас: </span><b style={{ color: f.rejected ? 'var(--danger)' : 'var(--text)' }}>{f.current || '—'}</b>
          </p>
          {f.lastEvent && (
            <p style={{ color: 'var(--text-soft)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Последнее событие: </span>{f.lastEvent.text}
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}> · {fmt(f.lastEvent.at)}</span>
            </p>
          )}
          {view.documents.length > 0 && (
            <p className="font-semibold" style={{ color: 'var(--success)' }}>Документы результата готовы: {view.documents.length} — в «Подробнее»</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Look E: status on top, every stage below as a vertical timeline. */
export function TimelineCard({ view }: { view: ShareView }) {
  const f = facts(view);
  const outcome = view.checklist?.outcome;
  const end = outcome === 'approved' ? { title: 'Заключение выдано', color: 'var(--success)' }
    : outcome === 'rejected' ? { title: 'Отказ', color: 'var(--danger)' } : null;
  return (
    <section className="rounded-[18px] border p-4 md:p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Заявление № {view.application_number}</p>
      <h2 className="mt-1 text-[20px] font-bold leading-[1.25] md:text-[24px]" style={{ color: 'var(--text)' }}>{view.title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill view={view} />
        <span className="text-[13px]" style={{ color: 'var(--text-soft)' }}>
          {f.days === null ? '' : `${f.finished ? 'шло' : 'в работе'} ${f.days} ${daysWord(f.days)}`}
          {f.approvals ? ` · согласования ${f.approvals.ok}/${f.approvals.total}` : ''}
        </span>
      </div>
      {f.steps.length > 0 && (
        <ol className="mt-5">
          {f.steps.map((s, i) => {
            const last = i === f.steps.length - 1 && !end;
            const color = s.state === 'done' ? BRAND.colors.violet : s.state === 'current' ? BRAND.colors.violetLight : 'var(--border-strong)';
            return (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${s.state === 'current' ? 'animate-pulse' : ''}`}
                    style={{ background: s.state === 'pending' ? 'transparent' : color, border: s.state === 'pending' ? `2px solid ${color}` : 'none' }}>
                    {s.state === 'done' ? '✓' : ''}
                  </span>
                  {!last && <span className="my-1 w-[2px] flex-1" style={{ background: s.state === 'done' ? BRAND.colors.violet : 'var(--border)', minHeight: 18 }} />}
                </div>
                <div className="pb-4">
                  <p className="text-[14px] font-semibold leading-[1.3]" style={{ color: s.state === 'pending' ? 'var(--text-muted)' : 'var(--text)' }}>{s.title}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: s.state === 'current' ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {s.state === 'done' ? `Готово${s.date ? ` · ${fmt(s.date)}` : ''}` : s.state === 'current' ? `Сейчас на этом этапе${s.date ? ` · с ${fmt(s.date)}` : ''}` : 'Впереди'}
                  </p>
                </div>
              </li>
            );
          })}
          {end && (
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: end.color }}>
                {outcome === 'rejected' ? '✕' : '✓'}
              </span>
              <p className="text-[14px] font-bold" style={{ color: end.color }}>{end.title}</p>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

/** Owner-only: preview the other looks of this very page (adds ?design=…&own=1). */
export function DesignSwitcher({ current, path }: { current: ShareDesign; path: string }) {
  return (
    <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border p-1 text-[12px] shadow-lg" style={{ background: '#0C0C0E', borderColor: 'rgba(255,255,255,0.12)', color: '#F3F1EC' }}>
        <span className="px-2" style={{ color: '#8E8B94' }}>Вид:</span>
        {SHARE_DESIGNS.map(d => (
          <a key={d.id} href={`${path}?design=${d.id}&own=1`} title={`${d.label} — ${d.hint}`}
            className="whitespace-nowrap rounded-full px-2.5 py-1.5 font-semibold"
            style={d.id === current ? { background: BRAND.colors.violet, color: '#fff' } : undefined}>
            {d.letter}{d.id === current ? ` · ${d.label}` : ''}
          </a>
        ))}
      </div>
    </div>
  );
}
