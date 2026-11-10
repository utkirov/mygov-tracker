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

const PERIODS: Array<{ months: number | null; label: string }> = [
  { months: 3, label: '3 месяца' },
  { months: 6, label: '6 месяцев' },
  { months: 12, label: 'Год' },
  { months: null, label: 'Всё время' },
];

/** The portal words a failed check as the requirement itself — say what it means. */
const failed = (label: string) => `Не выполнено: «${label.replace(/\.$/, '')}»`;
const stageName = (title: string) => (/^форма заявления$/i.test(title.trim()) ? 'После подачи — до первого действия' : title);

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [months, setMonths] = useState<number | null>(6);
  const [personal, setPersonal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (months) q.set('months', String(months));
    if (!personal) q.set('personal', '0');
    startTransition(() => setLoading(true));
    fetch(`/api/analytics?${q}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((a: Analytics) => startTransition(() => { setData(a); setLoading(false); }))
      .catch((e: Error) => startTransition(() => { setError(e.message); setLoading(false); }));
  }, [months, personal]);

  if (error) return <p className="p-6 text-[13px]" style={{ color: 'var(--danger)' }}>Не удалось загрузить аналитику: {error}</p>;
  if (!data) {
    return <div className="mx-auto max-w-5xl space-y-3 p-6">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-[14px] animate-shimmer" />)}</div>;
  }

  const t = data.totals;
  const stageRows = data.stages.filter(s => s.p80 >= 0.05).slice(0, 12);
  const live = data.forecasts.filter(f => !f.stale);
  const stale = data.forecasts.filter(f => f.stale);
  const slow = live.filter(f => f.pace === 'slow');
  const o = data.objects;
  const needsAttention = slow.length + data.awaiting.length + stale.length;
  const stageMax = Math.max(...stageRows.map(s => s.p80), 1);
  const serviceRows = data.services.filter(s => s.n > 0 || s.active > 0);
  const serviceMax = Math.max(...serviceRows.map(s => s.p80), 1);
  const monthMax = Math.max(...data.months.map(m => m.submitted), 1);
  const orgRows = data.orgs.filter(g => g.ok + g.bad + g.other >= 3)
    .sort((a, b) => (b.rejectRate ?? 0) - (a.rejectRate ?? 0) || b.total - a.total).slice(0, 20);
  const muted = { color: 'var(--text-muted)' };
  const text = { color: 'var(--text)' };

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 md:px-6 md:py-8">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight" style={text}>Сроки и аналитика</h1>
          <p className="mt-1 text-[13px]" style={muted}>
            {o.total} объектов · {t.applications} подач{data.filter.excludedPersonal ? ` · без личных: ${data.filter.excludedPersonal}` : ''}
            {data.filter.excludedOld ? ` · вне периода: ${data.filter.excludedOld}` : ''}. Объект — заявление со всеми повторными подачами.
            Медиана — половина уложилась в этот срок; «обычно до» — 80%.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2" style={{ opacity: loading ? 0.6 : 1 }}>
            {PERIODS.map(per => (
              <button key={per.label} type="button" onClick={() => setMonths(per.months)}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={months === per.months ? { background: 'var(--text)', color: 'var(--surface)' } : { background: 'var(--panel)', color: 'var(--text-soft)' }}>
                {per.label}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-1.5 text-[12px]" style={muted}>
              <input type="checkbox" checked={personal} onChange={e => setPersonal(e.target.checked)} />
              с личными заявлениями
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Объектов одобрено" value={`${o.approved} из ${o.approved + o.awaiting + o.dropped}`}
            sub={`${pct(o.approvalRate)} завершённых · по подачам ${pct(t.approvalRate)}`} />
          <Kpi label="Сейчас" value={`${o.active} в работе`} sub={`ждут повторной подачи: ${o.awaiting}`} />
          <Kpi label="Исправление после отказа" value={days(data.fixDays?.median)}
            sub={data.fixDays ? `обычно до ${days(data.fixDays.p80)} · ${data.fixDays.n} раз` : 'нет повторных подач'} />
          <Kpi label="Срок одной подачи" value={days(t.duration?.median)}
            sub={`одобрение ${days(t.approvedDuration?.median)} · отказ ${days(t.rejectedDuration?.median)}`} />
        </div>

        {needsAttention > 0 && (
          <Card title={`Требует внимания · ${needsAttention}`} hint="Что стоит открыть сегодня: идёт дольше обычного, ждёт новой подачи после отказа или давно зависло.">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--warning)' }}>Дольше обычного · {slow.length}</p>
                <ul className="mt-1.5 space-y-2">
                  {slow.map(f => (
                    <li key={f.applicationId} className="text-[12px]">
                      <Link href={`/applications/${f.applicationId}`} className="font-semibold hover:underline" style={text}>{f.title}</Link>
                      <p style={muted}>идёт {days(f.elapsedDays)}{f.overdueDays ? ` · сверх срока ${days(f.overdueDays)}` : ''}</p>
                      <p className="line-clamp-2" style={muted}>{f.stage}</p>
                    </li>
                  ))}
                  {slow.length === 0 && <li className="text-[12px]" style={muted}>Все в обычных сроках</li>}
                </ul>
              </div>
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--danger)' }}>Отказ — ждёт новой подачи · {data.awaiting.length}</p>
                <ul className="mt-1.5 space-y-2">
                  {data.awaiting.slice(0, 8).map(a => (
                    <li key={a.applicationId} className="text-[12px]">
                      <Link href={`/applications/${a.applicationId}`} className="font-semibold hover:underline" style={text}>{a.title}</Link>
                      <p style={muted}>отказ {a.daysSinceRejection === null ? '—' : `${days(a.daysSinceRejection)} назад`} · подач: {a.attempts}</p>
                    </li>
                  ))}
                  {data.awaiting.length > 8 && <li className="text-[11px]" style={muted}>и ещё {data.awaiting.length - 8}</li>}
                  {data.awaiting.length === 0 && <li className="text-[12px]" style={muted}>Нет</li>}
                </ul>
              </div>
              <div>
                <p className="text-[12px] font-semibold" style={muted}>Зависли · {stale.length}</p>
                <ul className="mt-1.5 space-y-2">
                  {stale.map(f => (
                    <li key={f.applicationId} className="text-[12px]">
                      <Link href={`/applications/${f.applicationId}`} className="font-semibold hover:underline" style={text}>{f.title}</Link>
                      <p style={muted}>идёт {days(f.elapsedDays)} — проверьте или перенесите в архив</p>
                    </li>
                  ))}
                  {stale.length === 0 && <li className="text-[12px]" style={muted}>Нет</li>}
                </ul>
              </div>
            </div>
          </Card>
        )}

        <Card title={`Сейчас в работе — прогноз · ${live.length}`} hint="Ожидаемая дата — подача + медианный срок такой же услуги (если их меньше 3 — по всем услугам). Зависшие — в блоке выше.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr style={muted}><th className={th}>Заявление</th><th className={th}>Идёт</th><th className={th}>Обычно</th><th className={th}>Ожидается</th><th className={th}>Последний этап · сколько на нём</th></tr></thead>
              <tbody>
                {live.map(f => (
                  <tr key={f.applicationId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className={td}>
                      <Link href={`/applications/${f.applicationId}`} className="font-semibold hover:underline" style={text}>{f.title}</Link>
                      <p className="font-mono text-[11px]" style={muted}>№ {f.application_number}</p>
                      {f.pace === 'slow' && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--warning)' }}>Дольше обычного: {f.reason}</p>}
                    </td>
                    <td className={`${td} tabular-nums`} style={f.pace === 'slow' ? { color: 'var(--warning)' } : text}>{days(f.elapsedDays)}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{days(f.typicalDays)}{f.typicalBasis === 'all' ? '*' : ''}</td>
                    <td className={`${td} tabular-nums`} style={f.overdueDays ? { color: 'var(--warning)' } : text}>
                      {f.overdueDays ? `сверх срока ${days(f.overdueDays)}` : f.expectedAt && new Date(f.expectedAt) < new Date() ? 'со дня на день' : shortDate(f.expectedAt)}
                    </td>
                    <td className={td} style={muted}>{stageName(f.stage || '—')}{f.stageDays !== null && <> · {days(f.stageDays)}{f.stageTypicalDays !== null && ` (обычно ${days(f.stageTypicalDays)})`}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {live.some(f => f.typicalBasis === 'all') && <p className="mt-2 text-[11px]" style={muted}>* мало истории по этой услуге — срок по всем услугам</p>}
        </Card>

        <Card title="Сколько ждут после каждого этапа" hint="Время от события в хронологии портала до следующего события. Тёмная часть — медиана, светлая — «обычно до»; справа — число заявлений.">
          <div className="space-y-2.5">
            {stageRows.map(s => (
              <div key={s.stage} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_140px]">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium" style={text}>{stageName(s.stage)}</p>
                  {s.actor && <p className="truncate text-[11px]" style={muted}>{s.actor}</p>}
                </div>
                <div className="hidden md:block"><DurationBar d={s} max={stageMax} /></div>
                <p className="text-right text-[12px] tabular-nums" style={text}>{days(s.median)} <span style={muted}>· до {days(s.p80)} · {s.n}</span></p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Сроки по услугам" hint="Одна услуга на русском и узбекском считается вместе. Сроки — по решённым подачам (одобрено или отказ).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr style={muted}><th className={th}>Услуга</th><th className={th}>Подач</th><th className={th}>Одобрено подач</th><th className={th}>Медиана</th><th className={th}>Обычно до</th><th className={`${th} w-[160px]`} /></tr></thead>
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
          <Card title="За что отказывают" hint={`По ${data.rejections.withResult} отказам с разбором критериев: какое требование не выполнено и сколько раз.`}>
            {data.rejections.criteria.length === 0 ? <p className="text-[12px]" style={muted}>Нет данных</p> : (
              <ul className="space-y-1.5">
                {data.rejections.criteria.map(c => (
                  <li key={c.label} className="flex justify-between gap-3 text-[12px]">
                    <span style={text}>{failed(c.label)}</span><span className="tabular-nums" style={muted}>{c.count}</span>
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

        {data.clients.length > 0 && (
          <Card title="По клиентам" hint="Заявления клиента с повторными подачами; срок — по решённым.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr style={muted}><th className={th}>Клиент</th><th className={th}>Заявлений</th><th className={th}>В работе</th><th className={th}>Одобрено</th><th className={th}>Срок до решения</th></tr></thead>
                <tbody>
                  {data.clients.map(c => (
                    <tr key={c.clientId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className={td}><Link href={`/clients/${c.clientId}`} className="font-semibold hover:underline" style={text}>{c.name}</Link></td>
                      <td className={`${td} tabular-nums`} style={muted}>{c.total}</td>
                      <td className={`${td} tabular-nums`} style={c.slow ? { color: 'var(--warning)' } : text}>{c.active}{c.slow ? ` · ${c.slow} дольше обычного` : ''}</td>
                      <td className={`${td} tabular-nums`} style={text}>{pct(c.approvalRate)} <span style={muted}>{c.approved}/{c.approved + c.rejected}</span></td>
                      <td className={`${td} tabular-nums`} style={text}>{days(c.duration?.median)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Комиссии: где чаще отказывают" hint="Ответы в «Заключении комиссии», от самой строгой: доля отказов и время ответа с момента принятия (от 3 ответов).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr style={muted}><th className={th}>Организация</th><th className={th}>Ответов</th><th className={th}>Отказы</th><th className={th}>Ответ, медиана</th><th className={th}>Обычно до</th></tr></thead>
              <tbody>
                {orgRows.map(g => (
                  <tr key={g.name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className={td} style={text}>{g.name}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{g.ok + g.bad + g.other}{g.wait ? ` · ждут ${g.wait}` : ''}</td>
                    <td className={`${td} tabular-nums`} style={(g.rejectRate ?? 0) >= 25 ? { color: 'var(--danger)' } : muted}>
                      <span className="inline-block w-9">{pct(g.rejectRate)}</span>
                      <span className="ml-1 inline-block h-1.5 rounded-full align-middle" style={{ width: Math.max(2, (g.rejectRate ?? 0) * 0.6), background: (g.rejectRate ?? 0) >= 25 ? 'var(--danger)' : 'var(--border-strong)' }} />
                    </td>
                    <td className={`${td} tabular-nums`} style={text}>{days(g.response?.median)}</td>
                    <td className={`${td} tabular-nums`} style={muted}>{days(g.response?.p80)}</td>
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
