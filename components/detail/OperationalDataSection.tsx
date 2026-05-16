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
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
        Операционные данные
      </p>
      <div className="mt-4 space-y-3 text-sm">
        <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
          <span className="text-[var(--text-soft)]">Организация</span>
          <p className="mt-2 font-medium text-[var(--text)]">{application.organization || '—'}</p>
        </div>
        <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
          <span className="text-[var(--text-soft)]">Дата подачи</span>
          <p className="mt-2 font-medium text-[var(--text)]">{formatDate(application.submission_date)}</p>
        </div>
        <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
          <span className="text-[var(--text-soft)]">Пароль для проверки</span>
          <p className="mt-2 font-medium text-[var(--text)]">{application.verification_password || '—'}</p>
        </div>
        <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
          <span className="text-[var(--text-soft)]">SMS-телефон</span>
          <p className="mt-2 font-medium text-[var(--text)]">{application.sms_phone || '—'}</p>
        </div>
        <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
          <span className="text-[var(--text-soft)]">Состояние фоновой очереди</span>
          <p className="mt-2 font-medium text-[var(--text)]">
            {sync.isRunning && sync.currentApplicationId === application.id
              ? 'Сейчас проверяется этим циклом'
              : application.archived
                ? 'Архивировано'
                : checkable
                  ? 'Под наблюдением'
                  : 'Исключено из цикла'}
          </p>
        </div>
      </div>
    </section>
  );
}
