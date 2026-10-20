'use client';

import { startTransition, useEffect, useState } from 'react';
import Link from 'next/link';

import type { Analytics } from '@/lib/analytics';

type Forecast = Analytics['forecasts'][number];

function days(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 24))} ч`;
  const v = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(v).replace('.', ',')} дн`;
}

/** Under the stepper: how long it takes so far vs. how long it usually takes. */
export function ForecastNote({ applicationId }: { applicationId: string }) {
  const [forecast, setForecast] = useState<Forecast | null>(null);

  useEffect(() => {
    fetch('/api/analytics', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((a: Analytics | null) => {
        const f = a?.forecasts.find(x => x.applicationId === applicationId) ?? null;
        startTransition(() => setForecast(f));
      })
      .catch(() => {});
  }, [applicationId]);

  if (!forecast || forecast.pace === 'unknown') return null;
  const slow = forecast.pace === 'slow';
  return (
    <div className="mt-3 rounded-[10px] px-3 py-2 text-[12px]"
      style={{ background: slow ? 'var(--warning-soft)' : 'var(--panel)', color: 'var(--text-soft)' }}>
      <p>
        Идёт <b style={{ color: slow ? 'var(--warning)' : 'var(--text)' }}>{days(forecast.elapsedDays)}</b>
        {forecast.typicalDays !== null && <> · обычно {days(forecast.typicalDays)}{forecast.typicalBasis === 'all' ? ' (по всем услугам)' : ' для этой услуги'}</>}
        {forecast.expectedAt && <> · ожидается к <b style={{ color: 'var(--text)' }}>{new Date(forecast.expectedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</b></>}
      </p>
      {forecast.stageDays !== null && forecast.stageTypicalDays !== null && (
        <p className="mt-0.5">Текущий этап: {days(forecast.stageDays)}, обычно {days(forecast.stageTypicalDays)}</p>
      )}
      {slow && <p className="mt-0.5" style={{ color: 'var(--warning)' }}>Дольше обычного — {forecast.reason}</p>}
      <Link href="/analytics" className="mt-1 inline-block text-[11px]" style={{ color: 'var(--accent)' }}>Вся аналитика</Link>
    </div>
  );
}
