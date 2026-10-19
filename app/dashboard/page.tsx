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

function KanbanCard({ application, index = 0 }: { application: Application; index?: number }) {
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
      className="kanban-card group relative block shrink-0 overflow-hidden rounded-[16px] border animate-slide-up"
      style={{
        background:    'var(--surface)',
        borderColor:   isUrgent ? col.color : 'var(--border)',
        boxShadow:     'var(--shadow-card)',
        // Capped so long columns don't leave a trailing tail of cards
        // still mid-fade a second after load — those looked cut off /
        // blank if the page was scrolled or screenshotted early.
        animationDelay: `${Math.min(index, 8) * 35}ms`,
      }}
    >
      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[16px]"
        style={{ background: `linear-gradient(to bottom, ${col.color}, ${col.color}55)`, opacity: isUrgent ? 1 : 0.7 }}
      />

      <div className="pl-5 pr-4 pt-4 pb-3.5">
        {/* Row 1 — number + state badges */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span
            className="font-mono text-[11px] tracking-[0.03em]"
            style={{ color: 'var(--text-muted)' }}
          >
            № {application.application_number}
          </span>
          <div className="flex items-center gap-1">
            {hasError && (
              <span className="rounded-[6px] px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.04em]"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                Ошибка
              </span>
            )}
            {isChecking && (
              <span className="rounded-[6px] px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.04em]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                Проверка
              </span>
            )}
            {hasChange && (
              <span className="rounded-[6px] px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.04em]"
                style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                Изменение
              </span>
            )}
          </div>
        </div>

        {/* Row 2 — main title */}
        <p
          className="text-[15px] font-bold leading-[1.35] tracking-[-0.01em]"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </p>
        {subtitle && (
          <p className="mt-1 text-[12px] leading-[1.5]" style={{ color: 'var(--text-soft)' }}>
            {subtitle}
          </p>
        )}

        {/* Row 3 — category + organization */}
        {(() => {
          const cat = getServiceCategory(application.service_name);
          return cat ? (
            <span
              className="mt-2 inline-block rounded-[6px] px-2 py-[3px] text-[11px] font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {cat}
            </span>
          ) : null;
        })()}
        {application.organization && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            <Building2 size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="truncate">{application.organization}</span>
          </p>
        )}

        {/* Row 4 — status + acting party */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold ${statusInfo.badge}`}>
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{
                background: 'currentColor',
                animation: (isChecking || isUrgent) ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
              }}
            />
            {statusInfo.label}
          </span>
          {isUrgent && (
            <span
              className="inline-block rounded-[7px] px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
            >
              Ждёт действия
            </span>
          )}
        </div>

        {/* Row 5 — footer */}
        <div
          className="mt-3.5 flex items-center justify-between gap-2 border-t pt-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-soft)' }}>
              {application.last_changed_date ? formatDate(application.last_changed_date) : '—'}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {application.last_checked_at
                ? `проверено ${formatTimeAgo(application.last_checked_at)}`
                : 'ещё не проверялось'}
            </span>
          </div>
          {application.parent_id && (
            <span className="shrink-0 flex items-center gap-1 text-[11px]" style={{ color: 'var(--accent)' }}>
              ⛓ Цепочка
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
  const [search,          setSearch]          = useState('');
  const [activeTab,       setActiveTab]       = useState<string>('all');
  const [categoryFilter,  setCategoryFilter]  = useState<ServiceCategory | null>(null);
  const [dataLoaded,      setDataLoaded]      = useState(false);
  const [unauthorized,    setUnauthorized]    = useState(false);

  const loadData = useCallback(async () => {
    const res = await fetch('/api/applications', { cache: 'no-store' });
    const data: unknown = res.ok ? await res.json() : null;
    startTransition(() => {
      setUnauthorized(res.status === 401);
      setApplications(Array.isArray(data) ? data as Application[] : []);
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
    <div className="flex h-[calc(100svh-60px)] flex-col overflow-hidden">

      {/* ── Board header ── */}
      <div
        className="border-b px-4 py-3 md:px-6 md:py-4 animate-slide-down"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {/* Title + search */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-extrabold tracking-tight md:text-base" style={{ color: 'var(--text)' }}>
              Доска заявлений
            </h1>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular font-semibold" style={{ color: 'var(--text-soft)' }}>{active.length}</span> активных
              {' · '}
              {formatDate(sync.lastRunAt)}
            </p>
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="w-36 rounded-[10px] px-3 py-2 text-[13px] outline-none transition focus:ring-2 md:w-52"
            style={{
              background:   'var(--panel)',
              border:       '1px solid var(--border)',
              color:        'var(--text)',
            }}
          />
        </div>

        {/* Stat chips */}
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {active.length} активных
          </span>
          {urgentCount > 0 && (
            <span className="shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              {urgentCount} ждут действия
            </span>
          )}
          <span className="shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
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
                className="shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition active:scale-95"
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
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none md:hidden">
          <button
            onClick={() => setActiveTab('all')}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-95"
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
                className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-95"
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

      {unauthorized && (
        <div
          className="mx-4 mt-3 rounded-[12px] px-4 py-3 text-[13px] md:mx-6"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          Нет доступа к данным. Откройте ссылку с токеном (<span className="font-mono">?token=…</span>) — его значение лежит в <span className="font-mono">APP_TOKEN</span> в файле <span className="font-mono">.env.local</span>.
        </div>
      )}

      {/* ── Mobile list view ── */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        <div className="flex-1 overflow-y-auto p-3">
          {!dataLoaded ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-[16px] border p-4"
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
                className="mt-3 rounded-[9px] px-4 py-2 text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)' }}
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
              style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)' }}
            >
              + Добавить заявление
            </Link>
          </div>
        ) : columns.map((col, colIdx) => (
          <div key={col.id} className="flex min-h-0 w-[288px] min-w-[288px] flex-col animate-slide-up" style={{ animationDelay: `${colIdx * 60}ms` }}>
            {/* Column header */}
            <div
              className="mb-3 flex items-center gap-2.5 rounded-[13px] px-3.5 py-3"
              style={{
                background:   `linear-gradient(to bottom, ${col.color}1A, var(--surface))`,
                borderTop:    `3px solid ${col.color}`,
                borderRight:  `1px solid ${col.color}30`,
                borderBottom: `1px solid ${col.color}30`,
                borderLeft:   `1px solid ${col.color}30`,
                boxShadow:    'var(--shadow-card)',
              }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: col.color, boxShadow: `0 0 8px ${col.color}AA` }}
              />
              <span
                className="flex-1 text-[12px] font-bold uppercase tracking-[0.06em]"
                style={{ color: 'var(--text)' }}
              >
                {col.label}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular"
                style={{ background: col.bgColor, color: col.textColor }}
              >
                {col.apps.length}
              </span>
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
                  <div key={i} className="rounded-[16px] border p-4"
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
                      className="rounded-[13px] border border-dashed px-4 py-8 text-center text-[12px]"
                      style={{ borderColor: `${col.color}30`, color: 'var(--text-muted)' }}
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
