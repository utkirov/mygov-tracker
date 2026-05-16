'use client';

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';

import { requestImmediateSyncRun, syncEngineEvents, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { formatDate, getChangeHeadline } from '@/lib/format-utils';
import type { Application, StatusHistory as TStatusHistory } from '@/types';
import {
  getApplicationChangeFieldLabel,
  getStatusType,
  isApplicationCheckable,
} from '@/types';

// Lazy-loaded sections for detail page
const HistorySection = dynamic(
  () => import('@/components/detail/HistorySection'),
  {
    loading: () => (
      <div className="h-96 rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-[24px] bg-[var(--panel-strong)] animate-pulse" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

const NotesSection = dynamic(
  () => import('@/components/detail/NotesSection'),
  {
    loading: () => (
      <div className="h-56 rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
        <div className="mt-4 h-32 rounded-[24px] bg-[var(--panel-strong)] animate-pulse" />
      </div>
    ),
    ssr: false,
  }
);

const PdfSection = dynamic(
  () => import('@/components/detail/PdfSection'),
  {
    loading: () => (
      <div className="h-40 rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
        <div className="mt-4 h-20 rounded-[24px] bg-[var(--panel-strong)] animate-pulse" />
      </div>
    ),
    ssr: false,
  }
);

const OperationalDataSection = dynamic(
  () => import('@/components/detail/OperationalDataSection'),
  {
    loading: () => (
      <div className="h-64 rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-[24px] bg-[var(--panel-strong)] animate-pulse" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sync = useSyncEngineSnapshot();
  const [application, setApplication] = useState<Application | null>(null);
  const [history, setHistory] = useState<TStatusHistory[]>([]);
  const [notes, setNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [togglingArchive, setTogglingArchive] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);

  const loadApplication = useEffectEvent(async () => {
    const response = await fetch(`/api/applications/${id}`, { cache: 'no-store' });
    const payload = await response.json() as { application: Application; history: TStatusHistory[] };

    startTransition(() => {
      setApplication(payload.application);
      setHistory(payload.history);
      setNotes(payload.application.notes);
    });
  });

  useEffect(() => {
    void loadApplication();

    const handleApplicationsUpdated = () => {
      void loadApplication();
    };

    window.addEventListener(syncEngineEvents.applications, handleApplicationsUpdated);
    return () => {
      window.removeEventListener(syncEngineEvents.applications, handleApplicationsUpdated);
    };
  }, []);

  async function handleCheck() {
    setChecking(true);
    try {
      await fetch(`/api/applications/${id}/check`, { method: 'POST' });
      requestImmediateSyncRun();
      await loadApplication();
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveNotes() {
    if (!application) {
      return;
    }

    setSavingNotes(true);
    try {
      await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      await loadApplication();
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleToggleArchive() {
    if (!application) {
      return;
    }

    setTogglingArchive(true);
    try {
      await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !application.archived }),
      });
      router.push(application.archived ? '/dashboard' : '/archive');
    } finally {
      setTogglingArchive(false);
    }
  }

  async function handlePdfReupload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPdfUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`/api/applications/${id}/pdf`, { method: 'POST', body: formData });
      await loadApplication();
    } finally {
      setPdfUploading(false);
      event.target.value = '';
    }
  }

  const timelineItems = useMemo(() => {
    return history.map((entry, index) => {
      const matchesCurrentStatus = application ? entry.status === application.status : false;
      const matchesCurrentAction = application ? entry.current_action === application.current_action : false;
      const isCurrentSnapshot = index === 0 || (matchesCurrentStatus && matchesCurrentAction);

      return {
        ...entry,
        isCurrentSnapshot,
      };
    });
  }, [application, history]);

  if (!application) {
    return <div className="px-6 py-10 text-sm text-[var(--text-soft)]">Загрузка заявления…</div>;
  }

  const checkable = isApplicationCheckable(application);
  const statusType = getStatusType(application.acting_party, application.status);
  const statusTone = {
    action_required: 'text-red-700 dark:text-red-300',
    in_progress: 'text-amber-800 dark:text-amber-200',
    completed: 'text-emerald-700 dark:text-emerald-300',
  }[statusType];

  return (
    <div className="px-4 py-5 md:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <button
                onClick={() => router.back()}
                className="rounded-full bg-[var(--panel-strong)] px-3 py-1.5 text-sm text-[var(--text-soft)] transition hover:text-[var(--text)]"
              >
                Назад
              </button>
              <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Заявление № {application.application_number}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
                {application.object_name || application.service_name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-soft)] md:text-base">
                {application.object_name ? application.service_name : application.organization}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Последнее изменение
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {formatDate(application.last_changed_date)}
                </p>
              </div>
              <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Последняя проверка
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {formatDate(application.last_checked_at)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Статус
              </p>
              <p className={`mt-3 text-lg font-semibold ${statusTone}`}>
                {application.status}
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Действует
              </p>
              <p className="mt-3 text-lg font-semibold text-[var(--text)]">
                {application.acting_party || '—'}
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Следующая проверка
              </p>
              <p className="mt-3 text-lg font-semibold text-[var(--text)]">
                {formatDate(application.next_check_at)}
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Состояние цикла
              </p>
              <p className="mt-3 text-lg font-semibold text-[var(--text)]">
                {application.sync_state}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {checkable ? (
              <button
                onClick={handleCheck}
                disabled={checking}
                className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              >
                {checking ? 'Проверяю…' : 'Проверить сейчас'}
              </button>
            ) : (
              <div className="rounded-2xl bg-[var(--panel-strong)] px-5 py-3 text-sm text-[var(--text-soft)]">
                Архивные и завершённые заявления больше не участвуют в очереди.
              </div>
            )}

            <a
              href={`/api/applications/${id}/preview`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]"
            >
              Открыть оригинал
            </a>
            <a
              href={`/api/applications/${id}/pdf`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]"
            >
              Открыть PDF
            </a>
            <button
              onClick={handleToggleArchive}
              disabled={togglingArchive}
              className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)] disabled:opacity-60"
            >
              {togglingArchive
                ? 'Сохраняю…'
                : application.archived
                  ? 'Вернуть в активные'
                  : 'Переместить в архив'}
            </button>
            <button
              onClick={() => router.push(`/applications/${id}/edit`)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]"
            >
              Изменить данные
            </button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Последнее найденное изменение
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {application.last_change_summary.length > 0 ? getChangeHeadline(application) : 'Изменения пока не зафиксированы'}
              </h2>

              <div className="mt-4 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_12%,var(--panel-strong))_0%,var(--panel-strong)_100%)] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      Последнее изменение в заявлении
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                      {formatDate(application.last_changed_date)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                      {application.last_change_summary[0] || 'После следующего реального изменения здесь появится краткое объяснение, что именно поменялось.'}
                    </p>
                  </div>

                  <div className="md:text-right">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      Обнаружено системой
                    </p>
                    <p className="mt-2 text-base font-semibold text-[var(--text)]">
                      {formatDate(application.last_detected_change_at)}
                    </p>
                  </div>
                </div>

                {application.last_change_fields.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {application.last_change_fields.map((field) => (
                      <span
                        key={field}
                        className="rounded-full bg-white/75 px-3 py-1.5 text-xs font-medium text-[var(--text)] dark:bg-white/8"
                      >
                        {getApplicationChangeFieldLabel(field)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {application.last_change_summary.length === 0 && (
                  <div className="rounded-[24px] bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--text-soft)]">
                    После следующего реального изменения здесь появится разница по полям: статус, текущее действие, действующая сторона и дата последнего изменения.
                  </div>
                )}

                {application.last_change_summary.map((line) => (
                  <div key={line} className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--text-soft)]">
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <HistorySection timelineItems={timelineItems} />
          </div>

          <div className="space-y-6">
            <OperationalDataSection
              application={application}
              sync={sync}
              checkable={checkable}
            />

            <NotesSection
              notes={notes}
              savingNotes={savingNotes}
              onNotesChange={setNotes}
              onBlur={handleSaveNotes}
            />

            <PdfSection
              applicationId={id}
              pdfFilename={application.pdf_filename}
              pdfUploading={pdfUploading}
              onPdfReupload={handlePdfReupload}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
