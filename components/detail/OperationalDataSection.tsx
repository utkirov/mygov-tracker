'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';

import type { Application } from '@/types';
import type { SyncEngineSnapshot } from '@/lib/sync-engine';
import { formatDate } from '@/lib/format-utils';
import { showToast } from '@/lib/toast';

import SectionHeading from './SectionHeading';

interface Props {
  application: Application;
  sync: SyncEngineSnapshot;
  checkable: boolean;
}

export default function OperationalDataSection({ application, sync, checkable }: Props) {
  const [showPassword, setShowPassword] = useState(false);

  async function handleCopyPassword() {
    if (!application.verification_password) return;
    try {
      await navigator.clipboard.writeText(application.verification_password);
      showToast({ title: 'Пароль скопирован', tone: 'success' });
    } catch {
      showToast({ title: 'Не удалось скопировать', description: 'Попробуй ещё раз.', tone: 'error' });
    }
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <SectionHeading eyebrow="Операционные данные" title="Данные для проверки статуса" />
      <div className="space-y-2 text-xs">
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Организация</span>
          <p className="mt-1 font-medium text-[var(--text)]">{application.organization || '—'}</p>
        </div>
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Дата подачи</span>
          <p className="mt-1 font-medium text-[var(--text)]">{formatDate(application.submission_date, { long: true })}</p>
        </div>
        <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
          <span className="text-[var(--text-muted)]">Пароль для проверки</span>
          <div className="mt-1 flex items-center gap-1.5">
            <p className="flex-1 font-mono font-medium text-[var(--text)]">
              {application.verification_password
                ? (showPassword ? application.verification_password : '••••••••')
                : '—'}
            </p>
            {application.verification_password && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] transition hover:bg-white/10"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyPassword()}
                  aria-label="Скопировать пароль"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] transition hover:bg-white/10"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Copy size={13} />
                </button>
              </>
            )}
          </div>
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
