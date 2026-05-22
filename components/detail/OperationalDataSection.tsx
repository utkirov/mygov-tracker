'use client';

import type { Application } from '@/types';
import type { SyncEngineSnapshot } from '@/lib/sync-engine';

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
  application: Application;
  sync: SyncEngineSnapshot;
  checkable: boolean;
}

export default function OperationalDataSection({ application, sync, checkable }: Props) {
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <p className="mb-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        Операционные данные
      </p>
      <div className="space-y-2 text-xs">
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Организация</span>
          <p className="mt-1 font-medium text-[var(--text)]">{application.organization || '—'}</p>
        </div>
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Дата подачи</span>
          <p className="mt-1 font-medium text-[var(--text)]">{formatDate(application.submission_date)}</p>
        </div>
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Пароль для проверки</span>
          <p className="mt-1 font-medium text-[var(--text)]">{application.verification_password || '—'}</p>
        </div>
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">SMS-телефон</span>
          <p className="mt-1 font-medium text-[var(--text)]">{application.sms_phone || '—'}</p>
        </div>
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Состояние фоновой очереди</span>
          <p className="mt-1 font-medium text-[var(--text)]">
            {sync.isRunning && sync.currentApplicationId === application.id
              ? 'Сейчас проверяется этим циклом'
              : application.archived
                ? 'Архивировано'
                : checkable
                  ? 'Под наблюдением'
                  : 'Исключено из цикла'}
          </p>
        </div>

        {application.last_error && (
          <div className="rounded-[10px] p-3" style={{ background: 'var(--danger-soft)' }}>
            <span className="text-[var(--text-muted)]">Причина ошибки</span>
            <p className="mt-1 text-[11px] leading-[1.5] font-medium" style={{ color: 'var(--danger)' }}>
              {application.last_error}
            </p>
            {application.last_error.includes('oldmy.gov.uz') && (
              <a
                href="https://oldmy.gov.uz:4433/ru/site/task-view"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-[11px] font-semibold underline"
                style={{ color: 'var(--accent)' }}
              >
                Проверить вручную на oldmy.gov.uz →
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
