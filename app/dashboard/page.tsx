'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

import { syncEngineEvents, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { formatDate, formatTimeAgo } from '@/lib/format-utils';
import { getServiceCategory, type ServiceCategory } from '@/lib/service-categories';
import type { Application, Project } from '@/types';
import { getMyGovStatus, getStatusType, isCompletedStatus } from '@/types';
import { LiveActivityWidget } from '@/components/LiveActivityWidget';

// ─── Kanban columns ────────────────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  statusKeys: string[];
}

const COLUMNS: KanbanColumn[] = [
  {
    id: 'new',
    label: 'Новое',
    color: 'var(--col-new)',
    bgColor: 'var(--col-new-soft)',
    textColor: 'var(--col-new)',
    statusKeys: ['новое', 'черновик'],
  },
  {
    id: 'processing',
    label: 'В обработке',
    color: 'var(--col-processing)',
    bgColor: 'var(--col-proc-soft)',
    textColor: 'var(--col-processing)',
    statusKeys: ['в обработке', 'переотправлена'],
  },
  {
    id: 'waiting',
    label: 'Ждёт действия',
    color: 'var(--col-waiting)',
    bgColor: 'var(--col-wait-soft)',
    textColor: 'var(--col-waiting)',
    statusKeys: ['в ожидании другого заявителя', 'в ожидании оплаты'],
  },
  {
    id: 'done',
    label: 'Завершено',
    color: 'var(--col-done)',
    bgColor: 'var(--col-done-soft)',
    textColor: 'var(--col-done)',
    statusKeys: ['обработано', 'отклонено', 'аннулировано'],
  },
];

function getColumn(status: string): KanbanColumn {
  const normalized = status.trim().toLowerCase();
  return COLUMNS.find(col => col.statusKeys.includes(normalized)) ?? COLUMNS[1];
}

// ─── Kanban card ───────────────────────────────────────────────────────────

function KanbanCard({ application, project }: { application: Application; project?: Project }) {
  const statusInfo = getMyGovStatus(application.status);
  const col        = getColumn(application.status);
  const isUrgent   = getStatusType(application.acting_party, application.status) === 'action_required';
  const hasError   = Boolean(application.last_error);
  const hasChange  = application.last_change_fields.length > 0 && !hasError && application.sync_state !== 'checking';
  const isChecking = application.sync_state === 'checking';
  const title      = application.object_name || application.service_name;
  const subtitle   = application.object_name ? application.service_name : null;

  return (
    <Link
      href={`/applications/${application.id}`}
      className="group relative block overflow-hidden rounded-[14px] border transition-all duration-200 active:scale-[0.98] md:hover:-translate-y-[2px]"
      style={{
        background:  'var(--surface)',
        borderColor: isUrgent ? col.color : 'var(--border)',
        boxShadow:   'var(--shadow-card)',
      }}
    >
      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[14px]"
        style={{ background: col.color, opacity: isUrgent ? 1 : 0.5 }}
      />

      <div className="pl-4 pr-3.5 pt-3.5 pb-3">
        {/* Row 1 — number + state badges */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className="font-mono text-[10px] tracking-[0.04em]"
            style={{ color: 'var(--text-muted)' }}
          >
            № {application.application_number}
          </span>
          <div className="flex items-center gap-1">
            {hasError && (
              <span className="rounded-[5px] px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-[0.05em]"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                Ошибка
              </span>
            )}
            {isChecking && (
              <span className="rounded-[5px] px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-[0.05em]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                Проверка
              </span>
            )}
            {hasChange && (
              <span className="rounded-[5px] px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-[0.05em]"
                style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                Изменение
              </span>
            )}
          </div>
        </div>

        {/* Row 2 — main title */}
        <p
          className="text-[14px] font-bold leading-[1.35] tracking-[-0.01em]"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </p>
        {subtitle && (
          <p className="mt-1 text-[11px] leading-[1.4]" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}

        {/* Row 3 — category + organization */}
        {(() => {
          const cat = getServiceCategory(application.service_name);
          return cat ? (
            <span
              className="mt-1.5 inline-block rounded-[5px] px-1.5 py-[2px] text-[10px] font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {cat}
            </span>
          ) : null;
        })()}
        {application.organization && (
          <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-soft)' }}>
            <Building2 size={11} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="truncate">{application.organization}</span>
          </p>
        )}

        {/* Row 4 — status + acting party */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-[3px] text-[11px] font-semibold ${statusInfo.badge}`}>
            <span className="h-1.5 w-1.5 rounded-full shrink-0 opacity-70" style={{ background: 'currentColor' }} />
            {statusInfo.label}
          </span>
          {isUrgent && (
            <span
              className="inline-block rounded-[6px] px-2 py-[3px] text-[10px] font-semibold"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
            >
              Ждёт действия
            </span>
          )}
        </div>

        {/* Row 5 — footer */}
        <div
          className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-soft)' }}>
              {application.last_changed_date ? formatDate(application.last_changed_date) : '—'}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {application.last_checked_at
                ? `проверено ${formatTimeAgo(application.last_checked_at)}`
                : 'ещё не проверялось'}
            </span>
          </div>
          {project && (
            <span
              className="shrink-0 rounded-full px-2.5 py-[3px] text-[10px] font-semibold"
              style={{ background: `${project.color}20`, color: project.color }}
            >
              {project.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const sync = useSyncEngineSnapshot();
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [search,          setSearch]          = useState('');
  const [activeTab,       setActiveTab]       = useState<string>('all');
  const [categoryFilter,  setCategoryFilter]  = useState<ServiceCategory | null>(null);
  const [dataLoaded,      setDataLoaded]      = useState(false);

  const loadData = useCallback(async () => {
    const [appRes, projRes] = await Promise.all([
      fetch('/api/applications',  { cache: 'no-store' }),
      fetch('/api/projects',      { cache: 'no-store' }),
    ]);
    const [apps, projs] = await Promise.all([
      appRes.json()  as Promise<Application[]>,
      projRes.json() as Promise<Project[]>,
    ]);
    startTransition(() => {
      setApplications(apps);
      setProjects(projs);
      setDataLoaded(true);
    });
  }, []);

  useEffect(() => {
    void loadData();
    window.addEventListener(syncEngineEvents.applications, loadData);
    return () => window.removeEventListener(syncEngineEvents.applications, loadData);
  }, [loadData]);

  const active = useMemo(
    () => applications.filter(a => !a.archived),
    [applications],
  );

  const presentCategories = useMemo(() => {
    const seen = new Set<ServiceCategory>();
    for (const a of active) {
      const cat = getServiceCategory(a.service_name);
      if (cat) seen.add(cat);
    }
    return [...seen].sort();
  }, [active]);

  const filtered = useMemo(() => {
    let result = active;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(a =>
        [a.application_number, a.object_name, a.service_name, a.organization]
          .join(' ').toLowerCase().includes(q),
      );
    }
    if (categoryFilter) {
      result = result.filter(a => getServiceCategory(a.service_name) === categoryFilter);
    }
    return result;
  }, [active, search, categoryFilter]);

  const columns = useMemo(() =>
    COLUMNS.map(col => ({
      ...col,
      apps: filtered.filter(a => {
        const n = a.status.trim().toLowerCase();
        return col.statusKeys.includes(n) ||
          (col.id === 'processing' && !COLUMNS.some(c => c.statusKeys.includes(n)));
      }),
    })),
  [filtered]);

  const urgentCount    = useMemo(
    () => active.filter(a => getStatusType(a.acting_party, a.status) === 'action_required').length,
    [active],
  );
  const completedCount = useMemo(
    () => applications.filter(a => isCompletedStatus(a.status)).length,
    [applications],
  );

  // Mobile: which column is visible
  const mobileColumn = COLUMNS.find(c => c.id === activeTab);
  const mobileApps   = useMemo(() => {
    if (!mobileColumn) return filtered;
    return columns.find(c => c.id === mobileColumn.id)?.apps ?? [];
  }, [mobileColumn, filtered, columns]);

  return (
    <div className="flex h-[calc(100svh-52px)] flex-col overflow-hidden">

      {/* ── Board header ── */}
      <div
        className="border-b px-3 py-2.5 md:px-5 md:py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {/* Title + search */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[13px] font-bold md:text-sm" style={{ color: 'var(--text)' }}>
              Доска заявлений
            </h1>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular">{active.length}</span> активных
              {' · '}
              {formatDate(sync.lastRunAt)}
            </p>
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="w-32 rounded-[9px] px-2.5 py-1.5 text-[12px] outline-none transition focus:ring-2 md:w-44"
            style={{
              background:   'var(--panel)',
              border:       '1px solid var(--border)',
              color:        'var(--text)',
            }}
          />
        </div>

        {/* Stat chips */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="shrink-0 rounded-[6px] px-2 py-[3px] text-[10px] font-semibold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {active.length} активных
          </span>
          {urgentCount > 0 && (
            <span className="shrink-0 rounded-[6px] px-2 py-[3px] text-[10px] font-semibold"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              {urgentCount} ждут действия
            </span>
          )}
          <span className="shrink-0 rounded-[6px] px-2 py-[3px] text-[10px] font-semibold"
            style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399' }}>
            {completedCount} завершено
          </span>
        </div>

        {/* Category filter chips */}
        {presentCategories.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="shrink-0 rounded-[6px] px-2 py-[3px] text-[10px] font-semibold transition"
                style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}
              >
                × Все
              </button>
            )}
            {presentCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(prev => prev === cat ? null : cat)}
                className="shrink-0 rounded-[6px] px-2 py-[3px] text-[10px] font-semibold transition"
                style={categoryFilter === cat
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--accent-soft)', color: 'var(--accent)' }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Mobile column tabs */}
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none md:hidden">
          <button
            onClick={() => setActiveTab('all')}
            className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition"
            style={activeTab === 'all'
              ? { background: 'var(--text)', color: 'var(--bg)' }
              : { background: 'var(--panel)', color: 'var(--text-muted)' }
            }
          >
            Все ({filtered.length})
          </button>
          {COLUMNS.map(col => {
            const count = columns.find(c => c.id === col.id)?.apps.length ?? 0;
            return (
              <button
                key={col.id}
                onClick={() => setActiveTab(col.id)}
                className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition"
                style={activeTab === col.id
                  ? { background: col.color, color: '#fff' }
                  : { background: 'var(--panel)', color: 'var(--text-muted)' }
                }
              >
                {col.label}{count > 0 && ` (${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Mobile list view ── */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        <div className="flex-1 overflow-y-auto p-3">
          {!dataLoaded ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-[14px] border p-3.5 animate-pulse"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="mb-2 h-2.5 w-20 rounded" style={{ background: 'var(--panel)' }} />
                  <div className="h-3.5 w-full rounded" style={{ background: 'var(--panel)' }} />
                  <div className="mt-1.5 h-3 w-3/4 rounded" style={{ background: 'var(--panel)' }} />
                  <div className="mt-3 h-2 w-1/2 rounded" style={{ background: 'var(--panel)' }} />
                </div>
              ))}
            </div>
          ) : mobileApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Нет заявлений</p>
              <Link
                href="/add"
                className="mt-3 rounded-[9px] px-4 py-2 text-xs font-semibold text-white"
                style={{ background: 'var(--accent)' }}
              >
                + Добавить
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {mobileApps.map(app => (
                <KanbanCard
                  key={app.id}
                  application={app}
                  project={app.project_id ? projects.find(p => p.id === app.project_id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Live activity widget ── */}
      <LiveActivityWidget applications={applications} sync={sync} />

      {/* ── Desktop kanban board ── */}
      <div
        className="hidden flex-1 gap-3 overflow-x-auto p-4 md:flex md:p-5"
        style={{ alignItems: active.length === 0 ? 'center' : 'flex-start', justifyContent: active.length === 0 ? 'center' : undefined }}
      >
        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-[18px] text-3xl"
              style={{ background: 'var(--panel)' }}
            >
              📋
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Заявлений пока нет</p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Загрузите PDF с my.gov.uz, чтобы начать мониторинг
              </p>
            </div>
            <Link
              href="/add"
              className="rounded-[10px] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110"
              style={{ background: 'var(--accent)' }}
            >
              + Добавить заявление
            </Link>
          </div>
        ) : columns.map(col => (
          <div key={col.id} className="flex w-[272px] min-w-[272px] flex-col">
            {/* Column header */}
            <div
              className="mb-2.5 flex items-center gap-2 rounded-t-[12px] px-3 py-2.5"
              style={{
                background:  'var(--surface)',
                borderBottom: `2px solid ${col.color}`,
                boxShadow:   'var(--shadow-card)',
              }}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: col.color }}
              />
              <span
                className="flex-1 text-[11px] font-bold uppercase tracking-[0.07em]"
                style={{ color: 'var(--text)' }}
              >
                {col.label}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular"
                style={{ background: col.bgColor, color: col.textColor }}
              >
                {col.apps.length}
              </span>
            </div>

            {/* Cards */}
            <div
              className="flex flex-col gap-2 overflow-y-auto scrollbar-none"
              style={{ maxHeight: 'calc(100vh - 200px)', paddingBottom: '8px' }}
            >
              {!dataLoaded ? (
                [1, 2].map(i => (
                  <div key={i} className="rounded-[14px] border p-3.5 animate-pulse"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="mb-2 h-2.5 w-20 rounded" style={{ background: 'var(--panel)' }} />
                    <div className="h-3.5 w-full rounded" style={{ background: 'var(--panel)' }} />
                    <div className="mt-1.5 h-3 w-3/4 rounded" style={{ background: 'var(--panel)' }} />
                    <div className="mt-3 h-2 w-1/2 rounded" style={{ background: 'var(--panel)' }} />
                  </div>
                ))
              ) : (
                <>
                  {col.apps.map(app => (
                    <KanbanCard
                      key={app.id}
                      application={app}
                      project={app.project_id ? projects.find(p => p.id === app.project_id) : undefined}
                    />
                  ))}
                  {col.apps.length === 0 && (
                    <div
                      className="rounded-[12px] border border-dashed px-3 py-6 text-center text-[11px]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Нет заявлений
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
