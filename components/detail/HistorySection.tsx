'use client';

import type { StatusHistory as TStatusHistory } from '@/types';

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  timelineItems: Array<TStatusHistory & { isCurrentSnapshot: boolean }>;
}

export default function HistorySection({ timelineItems }: Props) {
  return (
    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            История статусов
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            Хронология движения
          </h2>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {timelineItems.length === 0 && (
          <p className="rounded-[24px] bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--text-soft)]">
            История статусов пока пустая.
          </p>
        )}

        {timelineItems.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-[24px] border p-4 ${
              entry.isCurrentSnapshot
                ? 'border-[color:color-mix(in_oklab,var(--accent)_35%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_10%,var(--panel))_0%,var(--panel)_100%)]'
                : 'border-[var(--border)] bg-[var(--panel)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  {entry.status}
                </p>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  {entry.current_action || 'Без дополнительного действия'}
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {entry.acting_party || 'Без действующей стороны'}
                </p>
              </div>
              {entry.isCurrentSnapshot && (
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                  Текущий срез
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {formatDate(entry.recorded_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
