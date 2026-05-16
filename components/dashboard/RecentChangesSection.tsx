'use client';

import Link from 'next/link';
import type { Application } from '@/types';
import { getApplicationChangeFieldLabel } from '@/types';

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

function sectionTitle(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getChangeHeadline(application: Application) {
  if (application.last_change_fields.includes('last_changed_date')) {
    return 'Обновилась дата последнего движения';
  }

  if (application.last_change_fields.includes('status')) {
    return 'Изменился статус';
  }

  if (application.last_change_fields.includes('acting_party')) {
    return 'Сменилась действующая сторона';
  }

  if (application.last_change_fields.includes('current_action')) {
    return 'Обновилось текущее действие';
  }

  return 'Зафиксировано новое изменение';
}

interface Props {
  changedApplications: Application[];
  onNavigate?: () => void;
}

export default function RecentChangesSection({ changedApplications, onNavigate }: Props) {
  return (
    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Что изменилось
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            {sectionTitle(changedApplications.length, 'заявление с новым движением', 'заявлений с новым движением')}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-medium text-[var(--text-soft)]">
          Акцент на последнем изменении
        </span>
      </div>

      <div className="space-y-3">
        {changedApplications.length === 0 && (
          <div className="rounded-[24px] bg-[var(--panel-strong)] p-5 text-sm leading-6 text-[var(--text-soft)]">
            После следующего изменения карточки появятся здесь. Лента показывает только то, что реально изменилось при последней проверке.
          </div>
        )}

        {changedApplications.slice(0, 5).map((application) => (
          <Link
            key={application.id}
            href={`/applications/${application.id}`}
            className="block rounded-[24px] border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_10%,var(--panel))_0%,var(--panel)_100%)] p-4 transition hover:border-[var(--border-strong)]"
            onClick={onNavigate}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {application.object_name || application.service_name}
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--accent)]">
                  {getChangeHeadline(application)}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Последнее изменение
                </p>
                <p className="mt-1 text-xl font-semibold text-[var(--text)]">
                  {formatDate(application.last_changed_date)}
                </p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                  {application.last_change_fields.length} пол.
                </span>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Найдено {formatDate(application.last_detected_change_at)}
                </p>
              </div>
            </div>

            {application.last_change_fields.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {application.last_change_fields.map((field) => (
                  <span
                    key={field}
                    className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[var(--text)] dark:bg-white/8"
                  >
                    {getApplicationChangeFieldLabel(field)}
                  </span>
                ))}
              </div>
            )}

            <ul className="mt-4 space-y-2 text-sm text-[var(--text-soft)]">
              {application.last_change_summary.slice(0, 3).map((line) => (
                <li key={line} className="rounded-2xl bg-[var(--panel-strong)] px-3 py-2 leading-6">
                  {line}
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </div>
    </div>
  );
}
