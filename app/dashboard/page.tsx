'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

import { syncEngineEvents, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { formatDate, formatTimeAgo } from '@/lib/format-utils';
import { getServiceCategory, type ServiceCategory } from '@/lib/service-categories';
import type { Application } from '@/types';
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

function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'danger' }) {
  return (
    <span className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium"
      style={tone === 'danger'
        ? { background: 'var(--danger-soft)', color: 'var(--danger)' }
        : { background: 'var(--panel)', color: 'var(--text-soft)' }}>
      {children}
    </span>
  );
}

const STATUS_DOT: Record<string, string> = {
  'отклонено': 'var(--col-rejected)',
  'аннулировано': 'var(--col-canceled)',
};

function StatusDot({ status, size = 7 }: { status: string; size?: number }) {
  const color = STATUS_DOT[status.trim().toLowerCase()] ?? getColumn(status).color;
  return <span className="shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

function KanbanCard({ application, index = 0 }: { application: Application; index?: number }) {
  const statusInfo = getMyGovStatus(application.status);
  const isUrgent   = getStatusType(application.acting_party, application.status) === 'action_required';
  const hasError   = Boolean(application.last_error);
  const hasChange  = application.last_change_fields.length > 0 && !hasError && application.sync_state !== 'checking';
  const isChecking = application.sync_state === 'checking';
  const title      = application.object_name || application.service_name;
  const subtitle   = application.object_name ? application.service_name : null;
  const category   = getServiceCategory(application.service_name);

  return (
    <Link
      href={`/applications/${application.id}`}
      className="kanban-card block shrink-0 rounded-[12px] border p-4 animate-slide-up"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        // Capped so long columns don't leave a tail of cards mid-fade.
        animationDelay: `${Math.min(index, 8) * 30}ms`,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          № {application.application_number}
        </span>
        <div className="flex items-center gap-1">
          {hasError && <Tag tone="danger">Ошибка</Tag>}
          {isChecking && <Tag>Проверяю…</Tag>}
          {hasChange && <Tag>Изменение</Tag>}
          {application.parent_id && <Tag>Цепочка</Tag>}
        </div>
      </div>

      <p className="text-[14px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
        {title}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[12px] leading-[1.5]" style={{ color: 'var(--text-soft)' }}>{subtitle}</p>
      )}
      {application.organization && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Building2 size={12} className="shrink-0" />
          <span className="truncate">{application.organization}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--text)' }}>
          <StatusDot status={application.status} />
          {statusInfo.label}
        </span>
        {isUrgent && (
          <span className="text-[12px] font-medium" style={{ color: 'var(--danger)' }}>Нужно ваше действие</span>
        )}
        {category && <Tag>{category}</Tag>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-soft)' }}>
          {application.last_changed_date ? formatDate(application.last_changed_date) : '—'}
        </span>
        <span className="text-[11px]" style={{ color: hasError ? 'var(--danger)' : 'var(--text-muted)' }}>
          {application.last_checked_at
            ? `${hasError ? 'ошибка · ' : ''}${formatTimeAgo(application.last_checked_at)}`
            : 'ещё не проверялось'}
        </span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === date.toDateString();
  return today ? `сегодня в ${time}` : `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} в ${time}`;
}

export default function DashboardPage() {
  const sync = useSyncEngineSnapshot();
  const [applications, setApplications] = useState<Application[]>([]);
  const [recentDone,   setRecentDone]   = useState<Application[]>([]);
  const [search,          setSearch]          = useState('');
  const [activeTab,       setActiveTab]       = useState<string>('all');
  const [categoryFilter,  setCategoryFilter]  = useState<ServiceCategory | null>(null);
  const [dataLoaded,      setDataLoaded]      = useState(false);
  const [unauthorized,    setUnauthorized]    = useState(false);

  const loadData = useCallback(async () => {
    const [res, archivedRes] = await Promise.all([
      fetch('/api/applications', { cache: 'no-store' }),
      fetch('/api/applications?archived=true', { cache: 'no-store' }),
    ]);
    const data: unknown = res.ok ? await res.json() : null;
    const archived: unknown = archivedRes.ok ? await archivedRes.json() : null;
    // Completed applications are auto-archived, so the "Завершено" column is
    // fed from the archive: everything finished in the last 7 days.
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const done = (Array.isArray(archived) ? archived as Application[] : [])
      .filter(a => isCompletedStatus(a.status) && Date.parse(a.last_changed_date ?? a.updated_at) >= weekAgo);
    startTransition(() => {
      setUnauthorized(res.status === 401);
      setApplications(Array.isArray(data) ? data as Application[] : []);
      setRecentDone(done);
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
    let result = [...active, ...recentDone];
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
  }, [active, recentDone, search, categoryFilter]);

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
  const completedCount = recentDone.length;
  const errorCount     = useMemo(() => active.filter(a => a.sync_state === 'error' || Boolean(a.last_error)).length, [active]);

  // Mobile: which column is visible
  const mobileColumn = COLUMNS.find(c => c.id === activeTab);
  const mobileApps   = useMemo(() => {
    if (!mobileColumn) return filtered;
    return columns.find(c => c.id === mobileColumn.id)?.apps ?? [];
  }, [mobileColumn, filtered, columns]);

  return (
    <div className="flex h-[calc(100svh-56px)] flex-col overflow-hidden">

      {/* ── Board header ── */}
      <div
        className="border-b px-4 py-3 md:px-6 md:py-4 animate-slide-down"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {/* Title + search */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight md:text-base" style={{ color: 'var(--text)' }}>
              Доска заявлений
            </h1>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular font-semibold" style={{ color: 'var(--text-soft)' }}>{active.length}</span> активных
              {sync.lastRunAt && <>{' · '}последняя проверка {formatClock(sync.lastRunAt)}</>}
              {sync.isRunning
                ? ' · проверка идёт'
                : sync.nextRunAt && <>{' · '}следующая {formatClock(sync.nextRunAt)}</>}
            </p>
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по номеру или объекту"
            className="w-36 rounded-[8px] px-3 py-1.5 text-[13px] outline-none transition focus:ring-2 md:w-64"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
          />
        </div>

        {/* Stat chips */}
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium" style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>
            {active.length} активных
          </span>
          {urgentCount > 0 && (
            <span className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium" style={{ background: 'var(--panel)', color: 'var(--danger)' }}>
              {urgentCount} ждут действия
            </span>
          )}
          {errorCount > 0 && (
            <span className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium" style={{ background: 'var(--panel)', color: 'var(--danger)' }}>
              {errorCount} {errorCount === 1 ? 'ошибка' : errorCount < 5 ? 'ошибки' : 'ошибок'} проверки
            </span>
          )}
          <span className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium" style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>
            {completedCount} завершено за 7 дней
          </span>
        </div>

        {/* Category filter chips */}
        {presentCategories.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition active:scale-95"
                style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}
              >
                × Все
              </button>
            )}
            {presentCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(prev => prev === cat ? null : cat)}
                className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium transition active:scale-95"
                style={categoryFilter === cat
                  ? { background: 'var(--primary)', color: 'var(--on-primary)' }
                  : { background: 'var(--panel)', color: 'var(--text-soft)' }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Mobile column tabs */}
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none md:hidden">
          <button
            onClick={() => setActiveTab('all')}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-95"
            style={activeTab === 'all'
              ? { background: 'var(--primary)', color: 'var(--on-primary)' }
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
                className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-95"
                style={activeTab === col.id
                  ? { background: 'var(--primary)', color: 'var(--on-primary)' }
                  : { background: 'var(--panel)', color: 'var(--text-muted)' }
                }
              >
                {col.label}{count > 0 && ` (${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {unauthorized && (
        <div
          className="mx-4 mt-3 rounded-[12px] px-4 py-3 text-[13px] md:mx-6"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          Нет доступа к данным. <Link href="/login" className="underline">Войдите заново</Link>.
        </div>
      )}

      {/* ── Mobile list view ── */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        <div className="flex-1 overflow-y-auto p-3">
          {!dataLoaded ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-[12px] border p-4"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="mb-2.5 h-3 w-24 rounded animate-shimmer" />
                  <div className="h-4 w-full rounded animate-shimmer" />
                  <div className="mt-2 h-3.5 w-3/4 rounded animate-shimmer" />
                  <div className="mt-3 h-3 w-1/2 rounded animate-shimmer" />
                </div>
              ))}
            </div>
          ) : mobileApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Нет заявлений</p>
              <Link
                href="/add"
                className="mt-3 rounded-[8px] px-4 py-2 text-xs font-medium"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
              >
                + Добавить
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {mobileApps.map((app, idx) => (
                <KanbanCard
                  key={app.id}
                  index={idx}
                  application={app}
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
        className="hidden min-h-0 flex-1 gap-3 overflow-x-auto p-4 md:flex md:p-5"
        style={{ alignItems: active.length === 0 ? 'center' : 'stretch', justifyContent: active.length === 0 ? 'center' : undefined }}
      >
        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Заявлений пока нет</p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Загрузите PDF с my.gov.uz, чтобы начать мониторинг
              </p>
            </div>
            <Link
              href="/add"
              className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition hover:opacity-90"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              + Добавить заявление
            </Link>
          </div>
        ) : columns.map((col, colIdx) => (
          <div key={col.id} className="flex min-h-0 w-[288px] min-w-[288px] flex-col animate-slide-up" style={{ animationDelay: `${colIdx * 60}ms` }}>
            {/* Column header */}
            <div className="mb-2.5 flex items-center gap-2 px-1 py-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.color }} />
              <span className="flex-1 text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                {col.id === 'done' ? 'Завершено · 7 дней' : col.label}
              </span>
              <span className="tabular text-[12px]" style={{ color: 'var(--text-muted)' }}>{col.apps.length}</span>
            </div>

            {/* Cards — flex-1 + min-h-0 so the scroll area exactly fills the
                column instead of a hardcoded calc() that overshot the board
                and pushed the last 76px of scrollable content off-screen. */}
            <div
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto scrollbar-none"
              style={{ paddingBottom: '12px' }}
            >
              {!dataLoaded ? (
                [1, 2].map(i => (
                  <div key={i} className="rounded-[12px] border p-4"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="mb-2.5 h-3 w-24 rounded animate-shimmer" />
                    <div className="h-4 w-full rounded animate-shimmer" />
                    <div className="mt-2 h-3.5 w-3/4 rounded animate-shimmer" />
                    <div className="mt-3 h-3 w-1/2 rounded animate-shimmer" />
                  </div>
                ))
              ) : (
                <>
                  {col.apps.map((app, idx) => (
                    <KanbanCard
                      key={app.id}
                      index={idx}
                      application={app}
                    />
                  ))}
                  {col.apps.length === 0 && (
                    <div
                      className="rounded-[12px] border border-dashed px-4 py-8 text-center text-[12px]"
                      style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
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
