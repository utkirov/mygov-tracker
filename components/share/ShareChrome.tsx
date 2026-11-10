/**
 * TURON PROJECT frame of the public share page: the contact bar on top, the
 * «Сводка» hero card (design C), the call / Telegram card and the owner's
 * design switcher. Server components — no client JS.
 */
import { BRAND } from '@/lib/brand';
import { daysInWork, daysWord } from '@/lib/card-images';
import type { ShareDesign } from '@/lib/share-design';
import { SHARE_DESIGNS } from '@/lib/share-design';
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
  const dark = design === 'dark';
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

function stageProgress(view: ShareView): { done: number; total: number; current: string } {
  const steps = (view.checklist?.progress ?? []).filter(s => s.state !== 'skipped');
  const outcome = view.checklist?.outcome;
  const finished = view.completed || outcome === 'approved' || outcome === 'rejected';
  const done = finished ? steps.length : steps.filter(s => s.state === 'done').length;
  const current = finished
    ? (outcome === 'rejected' ? 'Отказ' : 'Рассмотрение завершено')
    : steps.find(s => s.state === 'current')?.title ?? view.current_action ?? '';
  return { done, total: steps.length, current };
}

/** Design C: everything a client asks first, in one card. */
export function SummaryHero({ view, showTitle = true }: { view: ShareView; showTitle?: boolean }) {
  const days = daysInWork(view.submission_date?.replace(' ', 'T'), view.completed ? view.last_changed_date?.replace(' ', 'T') : null);
  const { done, total, current } = stageProgress(view);
  const percent = total ? Math.round((done / total) * 100) : view.completed ? 100 : 0;
  return (
    <section className="overflow-hidden rounded-[18px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="p-4 md:p-6">
        {showTitle && (
          <>
            <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Заявление № {view.application_number}</p>
            <h2 className="mt-1 text-[20px] font-bold leading-[1.25] md:text-[24px]" style={{ color: 'var(--text)' }}>{view.title}</h2>
          </>
        )}
        <span className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold"
          style={{ background: 'var(--panel)', color: 'var(--text)' }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusDot(view) }} />
          {view.status}
        </span>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: view.completed ? 'Шло' : 'В работе', value: days === null ? '—' : String(days), unit: days === null ? '' : daysWord(days) },
            { label: 'Этап', value: total ? `${Math.min(done + (view.completed ? 0 : 1), total)}` : '—', unit: total ? `из ${total}` : '' },
            { label: 'Изменено', value: fmt(view.last_changed_date).slice(0, 5), unit: fmt(view.last_changed_date).slice(6, 10) },
          ].map(k => (
            <div key={k.label} className="rounded-[12px] p-3" style={{ background: 'var(--panel)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
              <p className="mt-1 text-[26px] font-bold leading-none" style={{ color: 'var(--text)' }}>{k.value}</p>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{k.unit}</p>
            </div>
          ))}
        </div>

        {total > 0 && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--panel)' }}>
              <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: view.checklist?.outcome === 'rejected' ? 'var(--danger)' : BRAND.colors.violet }} />
            </div>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Сейчас: </span><b style={{ color: 'var(--text)' }}>{current || '—'}</b>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Owner-only: preview the other looks of this very page (adds ?design=…&own=1). */
export function DesignSwitcher({ current, path }: { current: ShareDesign; path: string }) {
  return (
    <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div className="flex items-center gap-1 rounded-full border p-1 text-[12px] shadow-lg" style={{ background: '#0C0C0E', borderColor: 'rgba(255,255,255,0.12)', color: '#F3F1EC' }}>
        <span className="px-2" style={{ color: '#8E8B94' }}>Вид:</span>
        {SHARE_DESIGNS.map(d => (
          <a key={d.id} href={`${path}?design=${d.id}&own=1`} title={d.hint}
            className="rounded-full px-3 py-1.5 font-semibold"
            style={d.id === current ? { background: BRAND.colors.violet, color: '#fff' } : undefined}>
            {d.letter} · {d.label}
          </a>
        ))}
      </div>
    </div>
  );
}
