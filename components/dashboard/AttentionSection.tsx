'use client';

import Link from 'next/link';
import type { Application } from '@/types';
import { getStatusType } from '@/types';

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  attentionApplications: Application[];
  onNavigate?: () => void;
}

export default function AttentionSection({ attentionApplications, onNavigate }: Props) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
        Требуют внимания
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
        {attentionApplications.length === 0 ? 'Нет активных блокеров' : `Сейчас ${attentionApplications.length} кейсов с ответом заявителя`}
      </h2>
      <div className="mt-4 space-y-3">
        {attentionApplications.length === 0 && (
          <p className="rounded-[24px] bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--text-soft)]">
            Когда `Действует` переключится на заявителя, карточка появится здесь.
          </p>
        )}
        {attentionApplications.slice(0, 4).map((application) => (
          <Link
            key={application.id}
            href={`/applications/${application.id}`}
            className="block rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4 transition hover:border-[var(--border-strong)]"
            onClick={onNavigate}
          >
            <p className="text-sm font-semibold text-[var(--text)]">
              {application.object_name || application.service_name}
            </p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">
              {application.current_action || application.status}
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Последнее изменение: {formatDate(application.last_changed_date)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
