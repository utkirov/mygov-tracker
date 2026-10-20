'use client';

import { startTransition, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';

import type { Analytics, DurationStats } from '@/lib/analytics';

function days(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 24))} ч`;
  const v = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(v).replace('.', ',')} дн`;
}

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—');
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border p-4 md:p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
      <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
      {hint && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

/** Horizontal bar: median, with the «usually not longer than» (p80) part lighter. */
function DurationBar({ d, max }: { d: DurationStats; max: number }) {
  const w = (x: number) => `${Math.min(100, (x / Math.max(max, 0.1)) * 100)}%`;
  return (
    <div className="relative h-2 w-full rounded-full" style={{ background: 'var(--panel)' }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(d.p80), background: 'var(--accent-soft)' }} />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(d.median), background: 'var(--accent)' }} />
    </div>
  );
}

const th = 'px-2 py-1.5 text-left text-[11px] font-medium';
const td = 'px-2 py-1.5 text-[12px] align-top';

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/analytics', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((a: Analytics) => startTransition(() => setData(a)))
      .catch((e: Error) => startTransition(() => setError(e.message)));
  }, []);

  if (error) return <p className="p-6 text-[13px]" style={{ color: 'var(--danger)' }}>Не удалось загрузить аналитику: {error}</p>;
  if (!data) {
    return <div className="mx-auto max-w-5xl space-y-3 p-6">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-[14px] animate-shimmer" />)}</div>;
  }

  const t = data.totals;
  const stageRows = data.stages.filter(s => s.p80 >= 0.05).slice(0, 12);
  const slow = data.forecasts.filter(f => f.pace === 'slow');
  const stageMax = Math.max(...stageRows.map(s => s.p80), 1);
  const serviceRows = data.services.filter(s => s.n > 0 || s.active > 0);
  const serviceMax = Math.max(...serviceRows.map(s => s.p80), 1);
  const monthMax = Math.max(...data.months.map(m => m.submitted), 1);
  const orgRows = data.orgs.filter(o => o.total >= 2).slice(0, 20);
  const muted = { color: 'var(--text-muted)' };
  const text = { color: 'var(--text)' };

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 md:px-6 md:py-8">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight" style={text}>Сроки и аналитика</h1>
          <p className="mt-1 text-[13px]" style={muted}>
            По {t.applications} заявлениям, из них с хронологией портала — {data.coverage.withTimeline}. Медиана — половина заявлений
            уложилась в этот срок; «обычно до» — 80% заявлений.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Одобрено" value={pct(t.approvalRate)} sub={`${t.approved} из ${t.approved + t.rejected} решённых`} />
          <Kpi label="Срок до решения" value={days(t.duration?.median)} sub={t.duration ? `обычно до ${days(t.duration.p80)}` : undefined} />
          <Kpi label="Одобрение / отказ" value={`${days(t.approvedDuration?.median)} / ${days(t.rejectedDuration?.median)}`} sub="медиана" />
          <Kpi label="В работе" value={String(t.active)} sub={slow.length ? `дольше обычного: ${slow.length}` : 'все в обычных сроках'} />
        </div>

        <Card title="Сейчас в работе — прогноз" hint="Ожидаемая дата — подача + медианный срок такой же услуги (если их меньше 3 — по всем услугам).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr style={muted}><th className={th}>Заявление</th><th className={th}>Идёт</th><th className={th}>Обычно</th><th className={th}>Ожидается</th><th className={th}>Последний этап · сколько на нём</th></tr></thead>
              <tbody>
                {data.forecasts.map(f => (
                  <tr key={f.applicationId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className={td}>
                      <Link href={`/applications/${f.applicationId}`} className="font-semibold hover:underline" style={text}>{f.title}</Link>
                      <p className="font-mono text-[11px]" style={muted}>№ {f.application_number}</p>
                      {f.pace === 'slow' && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--warning)' }}>Дольше обычного: {f.reason}</p>}
                    </td>
                    <td className={`${td} tabular-nums`} style={f.pace === 'slow' ? { color: 'var(--warning)' } : text}>{days(f.elapsedDays)}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{days(f.typicalDays)}{f.typicalBasis === 'all' ? '*' : ''}</td>
                    <td className={`${td} tabular-nums`} style={f.expectedAt && new Date(f.expectedAt) < new Date() ? { color: 'var(--warning)' } : text}>{shortDate(f.expectedAt)}</td>
                    <td className={td} style={muted}>{f.stage || '—'}{f.stageDays !== null && <> · {days(f.stageDays)}{f.stageTypicalDays !== null && ` (обычно ${days(f.stageTypicalDays)})`}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.forecasts.some(f => f.typicalBasis === 'all') && <p className="mt-2 text-[11px]" style={muted}>* мало истории по этой услуге — срок по всем услугам</p>}
        </Card>

        <Card title="Сколько ждут после каждого этапа" hint="Время от события в хронологии портала до следующего события. Тёмная часть — медиана, светлая — «обычно до»; справа — число заявлений.">
          <div className="space-y-2.5">
            {stageRows.map(s => (
              <div key={s.stage} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_140px]">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium" style={text}>{s.stage}</p>
                  {s.actor && <p className="truncate text-[11px]" style={muted}>{s.actor}</p>}
                </div>
                <div className="hidden md:block"><DurationBar d={s} max={stageMax} /></div>
                <p className="text-right text-[12px] tabular-nums" style={text}>{days(s.median)} <span style={muted}>· до {days(s.p80)} · {s.n}</span></p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Сроки по услугам" hint="Только решённые заявления (одобрено или отказ).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr style={muted}><th className={th}>Услуга</th><th className={th}>Всего</th><th className={th}>Одобрено</th><th className={th}>Медиана</th><th className={th}>Обычно до</th><th className={`${th} w-[160px]`} /></tr></thead>
              <tbody>
                {serviceRows.map(s => (
                  <tr key={s.service} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className={td} style={text}><p className="line-clamp-2">{s.service}</p></td>
                    <td className={`${td} tabular-nums`} style={muted}>{s.total}{s.active ? ` (${s.active} в работе)` : ''}</td>
                    <td className={`${td} tabular-nums`} style={text}>{pct(s.approvalRate)} <span style={muted}>{s.approved}/{s.approved + s.rejected}</span></td>
                    <td className={`${td} tabular-nums`} style={text}>{s.n ? days(s.median) : '—'}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{s.n ? days(s.p80) : '—'}</td>
                    <td className={td}>{s.n > 0 && <DurationBar d={s} max={serviceMax} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Причины отказов" hint={`По ${data.rejections.withResult} отказам с разбором критериев.`}>
            {data.rejections.criteria.length === 0 ? <p className="text-[12px]" style={muted}>Нет данных</p> : (
              <ul className="space-y-1.5">
                {data.rejections.criteria.map(c => (
                  <li key={c.label} className="flex justify-between gap-3 text-[12px]">
                    <span style={text}>{c.label}</span><span className="tabular-nums" style={muted}>{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.rejections.orgs.length > 0 && (
              <>
                <p className="mt-4 text-[12px] font-semibold" style={text}>Кто чаще отказывает в отклонённых</p>
                <ul className="mt-1.5 space-y-1.5">
                  {data.rejections.orgs.slice(0, 8).map(o => (
                    <li key={o.name} className="flex justify-between gap-3 text-[12px]">
                      <span style={text}>{o.name}</span><span className="tabular-nums" style={muted}>{o.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Повторные подачи" hint="Портал связывает попытки одного заявления.">
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Одобрено с первой подачи" value={String(data.resubmissions.firstTimeApproved)} />
              <Kpi label="Одобрено после повторной" value={String(data.resubmissions.approvedAfterRetry)} />
            </div>
            <p className="mt-3 text-[12px]" style={muted}>
              В среднем подач до одобрения: <b style={text}>{data.resubmissions.avgAttemptsToApprove ?? '—'}</b>
            </p>
            <p className="mt-4 text-[12px] font-semibold" style={text}>По месяцам подачи</p>
            <div className="mt-2 space-y-1.5">
              {data.months.map(m => {
                const [y, mm] = m.month.split('-');
                const seg = (n: number, color: string) => n > 0 && <div style={{ width: `${(n / monthMax) * 100}%`, background: color }} />;
                return (
                  <div key={m.month} className="grid grid-cols-[56px_minmax(0,1fr)_32px] items-center gap-2 text-[11px]">
                    <span style={muted}>{MONTHS[+mm - 1]} {y.slice(2)}</span>
                    <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--panel)' }}>
                      {seg(m.approved, 'var(--success)')}{seg(m.rejected, 'var(--danger)')}{seg(m.active, 'var(--accent)')}{seg(m.cancelled, 'var(--border-strong)')}
                    </div>
                    <span className="text-right tabular-nums" style={text}>{m.submitted}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px]" style={muted}>
              <span style={{ color: 'var(--success)' }}>■</span> одобрено <span style={{ color: 'var(--danger)' }}>■</span> отказ{' '}
              <span style={{ color: 'var(--accent)' }}>■</span> в работе <span style={{ color: 'var(--border-strong)' }}>■</span> снято
            </p>
          </Card>
        </div>

        <Card title="Комиссии и организации" hint="Ответы в «Заключении комиссии»: доля отказов и время ответа с момента принятия.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr style={muted}><th className={th}>Организация</th><th className={th}>Ответов</th><th className={th}>Отказы</th><th className={th}>Ответ, медиана</th><th className={th}>Обычно до</th></tr></thead>
              <tbody>
                {orgRows.map(o => (
                  <tr key={o.name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className={td} style={text}>{o.name}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{o.ok + o.bad + o.other}{o.wait ? ` · ждут ${o.wait}` : ''}</td>
                    <td className={`${td} tabular-nums`} style={o.bad ? { color: 'var(--danger)' } : muted}>{pct(o.rejectRate)}</td>
                    <td className={`${td} tabular-nums`} style={text}>{days(o.response?.median)}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{days(o.response?.p80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
