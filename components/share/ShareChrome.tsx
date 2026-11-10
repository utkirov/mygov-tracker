/**
 * TURON PROJECT frame of the public share page: the contact bar on top, the
 * timeline card and the call / Telegram card. Server components; the only
 * client piece is the light / dark icon (ThemeToggle).
 */
import { BRAND } from '@/lib/brand';
import { daysInWork } from '@/lib/card-images';
import { daysLabel, shareText, stageHint, stageTitle, statusLabel, type ShareLang } from '@/lib/share-i18n';
import type { ShareView } from '@/lib/share-links';

import { fmt, statusDot } from './ShareApplication';
import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';

function Mark({ size = 34 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[9px] font-extrabold text-white"
      style={{ width: size, height: size, background: BRAND.colors.violet, fontSize: size * 0.4 }}>
      {BRAND.mark}
    </span>
  );
}

/** Company name, contacts and the light / dark icon — always on top of the page. */
export function ContactBar({ lang }: { lang: ShareLang }) {
  const c = BRAND.colors;
  const t = shareText(lang);
  const toggles = <span className="flex items-center gap-1.5"><LangToggle lang={lang} /><ThemeToggle /></span>;
  const link = 'inline-flex items-center gap-1.5 whitespace-nowrap hover:underline';
  return (
    <div className="share-bar relative overflow-hidden" style={{ background: c.ink, color: c.cream }}>
      {/* Violet glow — shown by CSS in the dark theme only. */}
      <div className="share-hero-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <a href={BRAND.site} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5">
            <Mark />
            <span className="leading-[1.15]">
              <span className="block text-[14px] font-bold tracking-[0.06em]">{BRAND.short}</span>
              <span className="block text-[11px]" style={{ color: c.muted }}>{t('product')}</span>
            </span>
          </a>
          <span className="sm:hidden">{toggles}</span>
        </div>
        <div className="flex flex-col gap-1 text-[12px] sm:items-end">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
            <a href={BRAND.phoneHref} className={link}><span style={{ color: c.violetLight }}>☎</span>{BRAND.phone}</a>
            <a href={BRAND.telegramUrl} target="_blank" rel="noopener noreferrer" className={link}><span style={{ color: c.violetLight }}>✈</span>{BRAND.telegram}</a>
            <a href={`mailto:${BRAND.email}`} className={`${link} hidden sm:inline-flex`}><span style={{ color: c.violetLight }}>@</span>{BRAND.email}</a>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: c.muted }}>
            <a href={BRAND.mapUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{t('address')}</a>
            <span>{t('hours')}</span>
          </div>
        </div>
        <span className="hidden sm:block">{toggles}</span>
      </div>
    </div>
  );
}

/** «Есть вопросы?» — call or write, at the end of the page. */
export function ContactCard({ lang }: { lang: ShareLang }) {
  const t = shareText(lang);
  return (
    <section className="rounded-[14px] border p-4 md:p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{t('questions')}</p>
      <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{BRAND.company} · {t('hours')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a href={BRAND.phoneHref} className="flex h-11 items-center justify-center rounded-[10px] text-[14px] font-semibold text-white" style={{ background: BRAND.colors.violet }}>
          {t('call')} · {BRAND.phone}
        </a>
        <a href={BRAND.telegramUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-[10px] border text-[14px] font-semibold"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}>
          {t('writeTelegram')}
        </a>
      </div>
    </section>
  );
}

/** When the decision is expected (lib/analytics.ts forecast), ready for display. */
export interface ShareForecast { date: string; soon: boolean; late: boolean; typicalDays: number | null }

// ── what the card shows ──

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

function StatusPill({ view, lang }: { view: ShareView; lang: ShareLang }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold"
      style={{ background: 'var(--panel)', color: 'var(--text)' }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusDot(view) }} />
      {statusLabel(lang, view.status)}
    </span>
  );
}

/** Status on top, every stage below as a vertical timeline. */
export function TimelineCard({ view, lang, forecast }: { view: ShareView; lang: ShareLang; forecast?: ShareForecast | null }) {
  const f = facts(view);
  const t = shareText(lang);
  const outcome = view.checklist?.outcome;
  const end = outcome === 'approved' ? { title: t('endApproved'), color: 'var(--success)' }
    : outcome === 'rejected' ? { title: t('endRejected'), color: 'var(--danger)' } : null;
  return (
    <section className="rounded-[18px] border p-4 md:p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>{t('application')} {view.application_number}</p>
      <h2 className="mt-1 text-[20px] font-bold leading-[1.25] md:text-[24px]" style={{ color: 'var(--text)' }}>{view.title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill view={view} lang={lang} />
        <span className="text-[13px]" style={{ color: 'var(--text-soft)' }}>
          {f.days === null ? '' : `${f.finished ? t('took') : t('inWork')} ${daysLabel(lang, f.days)}`}
          {f.approvals ? ` · ${t('approvalsShort')} ${f.approvals.ok}/${f.approvals.total}` : ''}
        </span>
      </div>
      {!f.finished && forecast && (
        <p className="mt-3 rounded-[10px] px-3 py-2 text-[13px]" style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}>
          {forecast.late
            ? t('expectedLate')
            : forecast.soon ? t('expectedSoon') : <>{t('expected')} <b>{forecast.date}</b></>}
          {forecast.typicalDays !== null && <span style={{ color: 'var(--text-muted)' }}> · {t('usually')} {daysLabel(lang, Math.max(1, Math.round(forecast.typicalDays)))}</span>}
        </p>
      )}
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
                  <p className="text-[14px] font-semibold leading-[1.3]" style={{ color: s.state === 'pending' ? 'var(--text-muted)' : 'var(--text)' }}>{stageTitle(lang, s.title)}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: s.state === 'current' ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {s.state === 'done' ? `${t('stepDone')}${s.date ? ` · ${fmt(s.date)}` : ''}` : s.state === 'current' ? `${t('stepNow')}${s.date ? ` · ${t('since')} ${fmt(s.date)}`.replace('  ', ' ') : ''}` : t('stepAhead')}
                  </p>
                  {s.state === 'current' && stageHint(lang, s.title) && (
                    <p className="mt-1 max-w-prose text-[12px] leading-[1.45]" style={{ color: 'var(--text-soft)' }}>{stageHint(lang, s.title)}</p>
                  )}
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
