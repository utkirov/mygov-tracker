'use client';

import type { StatusHistory as TStatusHistory } from '@/types';
import { formatDate } from '@/lib/format-utils';

import SectionHeading from './SectionHeading';

interface Props {
  timelineItems: Array<TStatusHistory & { isCurrentSnapshot: boolean }>;
}

export default function HistorySection({ timelineItems }: Props) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <SectionHeading eyebrow="История статусов" title="Хронология движения" />

      <div className="mt-4 space-y-2.5">
        {timelineItems.length === 0 && (
          <p className="rounded-[10px] bg-[var(--panel)] p-3 text-xs leading-5 text-[var(--text-muted)]">
            История статусов пока пустая.
          </p>
        )}

        {timelineItems.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-[10px] border p-3 ${
              entry.isCurrentSnapshot
                ? 'border-[var(--border-strong)] bg-[var(--surface)]'
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
                <span className="rounded-[6px] bg-[var(--panel)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                  Текущий срез
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {formatDate(entry.recorded_at, { long: true })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
