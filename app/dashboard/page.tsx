'use client';

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';

import { ApplicationCard } from '@/components/ApplicationCard';
import {
  requestImmediateSyncRun,
  syncEngineEvents,
  useSyncEngineSnapshot,
} from '@/lib/sync-engine';
import { formatDate } from '@/lib/format-utils';
import type { Application, Project, StatusType } from '@/types';
import { getStatusType } from '@/types';

// Lazy-loaded sections
const RecentChangesSection = dynamic(
  () => import('@/components/dashboard/RecentChangesSection'),
  {
    loading: () => (
      <div className="h-96 rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-[24px] bg-[var(--panel-strong)] animate-pulse" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

const AttentionSection = dynamic(
  () => import('@/components/dashboard/AttentionSection'),
  {
    loading: () => (
      <div className="h-72 rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-[24px] bg-[var(--panel-strong)] animate-pulse" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

const createFiltersSectionLoading = (projectsPresent: boolean) => {
  const LoadingComponent = () => (
    <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="h-6 w-40 rounded-lg bg-[var(--panel-strong)] animate-pulse" />
      <div className="mt-4 space-y-3">
        {/* Search input skeleton */}
        <div className="h-10 rounded-[20px] bg-[var(--panel-strong)] animate-pulse" />

        {/* Status filters skeleton */}
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-[var(--panel-strong)] animate-pulse" />
          ))}
        </div>

        {/* Project filters skeleton - only if projects exist */}
        {projectsPresent && (
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-24 rounded-full bg-[var(--panel-strong)] animate-pulse" />
            <div className="h-8 w-20 rounded-full bg-[var(--panel-strong)] animate-pulse" />
            <div className="h-8 w-28 rounded-full bg-[var(--panel-strong)] animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
  LoadingComponent.displayName = 'FiltersSectionLoading';
  return LoadingComponent;
};

const FiltersSection = dynamic(
  () => import('@/components/dashboard/FiltersSection'),
  {
    ssr: false,
  }
);

type StatusFilter = 'all' | StatusType;

export default function DashboardPage() {
  const sync = useSyncEngineSnapshot();
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadData();

    const handleApplicationsUpdated = () => {
      void loadData();
    };

    window.addEventListener(syncEngineEvents.applications, handleApplicationsUpdated);
    return () => {
      window.removeEventListener(syncEngineEvents.applications, handleApplicationsUpdated);
    };
  }, [loadData]);

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
          <RecentChangesSection
            changedApplications={changedApplications}
            onNavigate={() => {}}
          />

          <div className="space-y-6">
            <AttentionSection
              attentionApplications={attentionApplications}
              onNavigate={() => {}}
            />

            <Suspense fallback={createFiltersSectionLoading(projects.length > 0)()}>
              <FiltersSection
                search={search}
                statusFilter={statusFilter}
                statusFilters={statusFilters}
                projects={projects}
                projectFilter={projectFilter}
                onSearchChange={setSearch}
                onStatusFilterChange={setStatusFilter}
                onProjectFilterChange={setProjectFilter}
              />
            </Suspense>
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
