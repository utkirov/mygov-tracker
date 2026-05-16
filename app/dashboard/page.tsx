'use client';

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

import { ApplicationCard } from '@/components/ApplicationCard';
import {
  requestImmediateSyncRun,
  syncEngineEvents,
  useSyncEngineSnapshot,
} from '@/lib/sync-engine';
import type { Application, Project, StatusType } from '@/types';
import { getApplicationChangeFieldLabel, getStatusType } from '@/types';

type StatusFilter = 'all' | StatusType;

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

export default function DashboardPage() {
  const sync = useSyncEngineSnapshot();
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const loadData = useEffectEvent(async () => {
    const [applicationsResponse, projectsResponse] = await Promise.all([
      fetch('/api/applications', { cache: 'no-store' }),
      fetch('/api/projects', { cache: 'no-store' }),
    ]);

    const [applicationsPayload, projectsPayload] = await Promise.all([
      applicationsResponse.json() as Promise<Application[]>,
      projectsResponse.json() as Promise<Project[]>,
    ]);

    startTransition(() => {
      setApplications(applicationsPayload);
      setProjects(projectsPayload);
    });
  });

  useEffect(() => {
    void loadData();

    const handleApplicationsUpdated = () => {
      void loadData();
    };

    window.addEventListener(syncEngineEvents.applications, handleApplicationsUpdated);
    return () => {
      window.removeEventListener(syncEngineEvents.applications, handleApplicationsUpdated);
    };
  }, []);

  const activeApplications = useMemo(
    () => applications.filter((application) => !application.archived),
    [applications]
  );

  const changedApplications = useMemo(
    () => [...activeApplications]
      .filter((application) => application.last_change_fields.length > 0 && application.last_detected_change_at)
      .sort((left, right) => (right.last_detected_change_at ?? '').localeCompare(left.last_detected_change_at ?? '')),
    [activeApplications]
  );

  const attentionApplications = useMemo(
    () => [...activeApplications]
      .filter((application) => getStatusType(application.acting_party, application.status) === 'action_required')
      .sort((left, right) => (right.last_changed_date ?? '').localeCompare(left.last_changed_date ?? '')),
    [activeApplications]
  );

  const filteredApplications = useMemo(() => {
    return activeApplications
      .filter((application) =>
        statusFilter === 'all' || getStatusType(application.acting_party, application.status) === statusFilter
      )
      .filter((application) => projectFilter === null || application.project_id === projectFilter)
      .filter((application) => {
        if (!deferredSearch) {
          return true;
        }

        const haystack = [
          application.application_number,
          application.object_name,
          application.service_name,
          application.organization,
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(deferredSearch);
      })
      .sort((left, right) => {
        const leftPriority = getStatusType(left.acting_party, left.status) === 'action_required' ? 0 : 1;
        const rightPriority = getStatusType(right.acting_party, right.status) === 'action_required' ? 0 : 1;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return (right.last_changed_date ?? right.updated_at).localeCompare(left.last_changed_date ?? left.updated_at);
      });
  }, [activeApplications, deferredSearch, projectFilter, statusFilter]);

  const counts = useMemo(() => ({
    all: activeApplications.length,
    action_required: activeApplications.filter((application) => getStatusType(application.acting_party, application.status) === 'action_required').length,
    in_progress: activeApplications.filter((application) => getStatusType(application.acting_party, application.status) === 'in_progress').length,
    completed: activeApplications.filter((application) => getStatusType(application.acting_party, application.status) === 'completed').length,
  }), [activeApplications]);

  const statusFilters: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: `Все (${counts.all})` },
    { key: 'action_required', label: `Требуют действия (${counts.action_required})` },
    { key: 'in_progress', label: `В работе (${counts.in_progress})` },
    { key: 'completed', label: `Завершены (${counts.completed})` },
  ];

  return (
    <div className="px-4 py-5 md:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[var(--text-muted)]">
                Operational dashboard
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] md:text-4xl">
                Сначала видно, где было изменение. Только потом весь список.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--text-soft)] md:text-base">
                Очередь работает на уровне приложения. Пока окно открыто, активные заявления проверяются по расписанию,
                а архивные и завершённые исключаются из цикла.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[380px]">
              <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Последний цикл
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {formatDate(sync.lastRunAt)}
                </p>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  Следующий: {formatDate(sync.nextRunAt)}
                </p>
              </div>

              <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  Текущее состояние
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {sync.isRunning ? 'Идёт цикл проверки' : sync.enabled ? 'Готово к следующему циклу' : 'Автообновление выключено'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  {sync.isRunning ? `В очереди ${sync.queueLength}` : `Интервал ${sync.intervalMinutes} минут`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Активные
              </p>
              <p className="mt-3 text-3xl font-semibold text-[var(--text)]">
                {counts.all}
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                С изменениями
              </p>
              <p className="mt-3 text-3xl font-semibold text-[var(--text)]">
                {changedApplications.length}
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Требуют действия
              </p>
              <p className="mt-3 text-3xl font-semibold text-[var(--text)]">
                {attentionApplications.length}
              </p>
            </div>
            <button
              onClick={() => requestImmediateSyncRun()}
              className="flex items-center justify-center gap-2 rounded-[24px] bg-[var(--accent)] px-4 py-4 text-left text-sm font-semibold text-white transition hover:brightness-105"
            >
              <RefreshCw size={18} className={sync.isRunning ? 'animate-spin' : ''} />
              Проверить сейчас
            </button>
          </div>

          {sync.lastRunError && (
            <div className="mt-4 rounded-[24px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
              {sync.lastRunError}
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
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

          <div className="space-y-6">
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

            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Быстрые фильтры
              </p>
              <div className="mt-4 space-y-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по номеру, объекту, услуге"
                  className="w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                />

                <div className="flex flex-wrap gap-2">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setStatusFilter(filter.key)}
                      className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                        statusFilter === filter.key
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {projects.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setProjectFilter(null)}
                      className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                        projectFilter === null
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
                      }`}
                    >
                      Все проекты
                    </button>
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => setProjectFilter(project.id)}
                        className="rounded-full px-3 py-2 text-xs font-medium text-white transition"
                        style={{
                          backgroundColor: projectFilter === project.id ? project.color : `${project.color}B3`,
                        }}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Все активные заявления
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {filteredApplications.length} в рабочем списке
              </h2>
            </div>
            <p className="text-sm text-[var(--text-soft)]">
              Показываются только активные записи. Архив и завершённые состояния вынесены из основного потока.
            </p>
          </div>

          <div className="space-y-4">
            {filteredApplications.length === 0 && (
              <div className="rounded-[24px] bg-[var(--panel-strong)] p-6 text-sm leading-6 text-[var(--text-soft)]">
                Под текущие фильтры ничего не найдено. Можно сбросить фильтр или добавить новое заявление.
              </div>
            )}

            {filteredApplications.map((application) => {
              const project = application.project_id
                ? projects.find((entry) => entry.id === application.project_id)
                : undefined;

              return (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  project={project}
                />
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
