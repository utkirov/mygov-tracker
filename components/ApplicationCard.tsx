'use client';

import Link from 'next/link';

import type { Application, Project } from '@/types';
import {
  getApplicationChangeFieldLabel,
  getStatusType,
  isApplicationCheckable,
} from '@/types';

interface Props {
  application: Application;
  project?: Project;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSyncBadge(application: Application) {
  if (application.sync_state === 'checking') {
    return { label: 'Проверяется', className: 'bg-[var(--accent-soft)] text-[var(--accent)]' };
  }

  if (application.last_error) {
    return { label: 'Ошибка', className: 'bg-[var(--danger-soft)] text-red-700 dark:text-red-300' };
  }

  if (application.last_change_fields.length > 0) {
    return { label: 'Есть изменения', className: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200' };
  }

  if (!isApplicationCheckable(application)) {
    return { label: 'Остановлено', className: 'bg-[var(--panel-strong)] text-[var(--text-soft)]' };
  }

  return { label: 'Под наблюдением', className: 'bg-[var(--panel-strong)] text-[var(--text-soft)]' };
}

export function ApplicationCard({ application, project }: Props) {
  const type = getStatusType(application.acting_party, application.status);
  const syncBadge = getSyncBadge(application);
  const lastChangeSummary = application.last_change_summary[0] ?? application.current_action;
  const changeTitle = application.last_change_fields.includes('last_changed_date')
    ? 'Новый сдвиг по дате'
    : application.last_change_fields.length > 0
      ? 'Обновление по заявлению'
      : 'Изменений не зафиксировано';

  const statusTone = {
    action_required: 'text-red-700 dark:text-red-300',
    in_progress: 'text-amber-800 dark:text-amber-200',
    completed: 'text-emerald-700 dark:text-emerald-300',
  }[type];

  return (
    <Link
      href={`/applications/${application.id}`}
      className="group block rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="rounded-full bg-[var(--panel-strong)] px-2.5 py-1 font-mono">
                № {application.application_number}
              </span>
              {project && (
                <span
                  className="rounded-full px-2.5 py-1 font-medium"
                  style={{ backgroundColor: `${project.color}22`, color: project.color }}
                >
                  {project.name}
                </span>
              )}
            </div>

            <h3 className="text-lg font-semibold leading-7 text-[var(--text)]">
              {application.object_name || application.service_name}
            </h3>

            {application.object_name && (
              <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
                {application.service_name}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${syncBadge.className}`}>
              {syncBadge.label}
            </span>
            <span className={`text-sm font-semibold ${statusTone}`}>
              {application.status}
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-[22px] border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_12%,var(--panel-strong))_0%,var(--panel-strong)_100%)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Последнее изменение
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {formatDate(application.last_changed_date)}
                </p>
              </div>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] dark:bg-white/8">
                {changeTitle}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
              {lastChangeSummary || 'Изменений с последней проверки пока не зафиксировано.'}
            </p>

            {application.last_detected_change_at && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Обнаружено системой {formatDate(application.last_detected_change_at)}
              </p>
            )}

            {application.last_change_fields.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {application.last_change_fields.map((field) => (
                  <span
                    key={field}
                    className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-medium text-[var(--text)] dark:bg-white/8"
                  >
                    {getApplicationChangeFieldLabel(field)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Состояние проверки
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-soft)]">Последняя проверка</span>
                <span className="text-right text-[var(--text)]">{formatDate(application.last_checked_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-soft)]">Следующая проверка</span>
                <span className="text-right text-[var(--text)]">{formatDate(application.next_check_at)}</span>
              </div>
              {application.last_error && (
                <div className="rounded-2xl bg-[var(--danger-soft)] px-3 py-2 text-xs leading-5 text-red-700 dark:text-red-300">
                  {application.last_error}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Текущее действие
            </p>
            <p className="mt-1 text-[var(--text-soft)]">
              {application.current_action || 'Текущее действие пока не указано'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-medium text-[var(--text-soft)]">
              {application.acting_party || 'Без стороны'}
            </span>
            <span className="font-medium text-[var(--accent)]">
              Открыть
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
