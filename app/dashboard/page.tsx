'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { AttentionStrip } from '@/components/AttentionStrip';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

import { syncEngineEvents, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { formatDate, formatTimeAgo } from '@/lib/format-utils';
import { getServiceCategory, type ServiceCategory } from '@/lib/service-categories';
import type { Application } from '@/types';
import { getMyGovStatus, getStatusType, isCompletedStatus } from '@/types';
import { LiveActivityWidget } from '@/components/LiveActivityWidget';
import { showToast } from '@/lib/toast';

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

/** «Согласования 7/10» bar, or the rejection, from the approvals checklist. */
function ForecastLine({ forecast }: { forecast?: Application['forecast'] }) {
  if (!forecast) return null;
  if (forecast.pace === 'slow') {
    return <p className="mt-2 line-clamp-2 text-[11px]" style={{ color: 'var(--warning)' }} title={forecast.reason}>Дольше обычного: {forecast.reason}</p>;
  }
  if (!forecast.expectedAt) return null;
  return (
    <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      Ожидается к {new Date(forecast.expectedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
    </p>
  );
}

function ApprovalsLine({ summary }: { summary?: Application['checklist_summary'] }) {
  if (!summary) return null;
  const stage = summary.stage && summary.stageCount ? (
    <p className="mt-2 truncate text-[11px]" style={{ color: 'var(--text-muted)' }} title={summary.stage}>
      Этап {summary.stageIndex} из {summary.stageCount}: <span style={{ color: 'var(--text-soft)' }}>{summary.stage}</span>
    </p>
  ) : null;
  if (summary.total === 0 && !summary.result) return stage;
  return <>{stage}<ApprovalsBarLine summary={summary} /></>;
}

function ApprovalsBarLine({ summary }: { summary: NonNullable<Application['checklist_summary']> }) {
  if (summary.result === 'rejected') {
    return (
      <p className="mt-2 text-[12px] font-medium" style={{ color: 'var(--danger)' }}>
        ✕ Отказ{summary.failed ? ` · не выполнено критериев: ${summary.failed}` : ''}
      </p>
    );
  }
  if (summary.total === 0) return null;
  const seg = (n: number, color: string) => n > 0 && <span style={{ flex: n, background: color }} />;
  return (
    <div className="mt-2.5">
      <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--panel)' }}>
        {seg(summary.ok, 'var(--success)')}
        {seg(summary.other, 'var(--text-muted)')}
        {seg(summary.bad, 'var(--danger)')}
        {seg(summary.wait, 'var(--border-strong)')}
      </div>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Согласования {summary.ok}/{summary.total}{summary.bad ? ` · отказ ${summary.bad}` : ''}{summary.wait ? ` · ждём ${summary.wait}` : ''}
      </p>
    </div>
  );
}

function KanbanCard({ application, index = 0, select }: { application: Application; index?: number; select?: { on: boolean; picked: boolean; toggle: (id: string) => void } }) {
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
      onClick={select?.on ? e => { e.preventDefault(); select.toggle(application.id); } : undefined}
      aria-pressed={select?.on ? select.picked : undefined}
      className="kanban-card block shrink-0 rounded-[12px] border p-4 animate-slide-up"
      style={{
        background: 'var(--surface)',
        borderColor: select?.picked ? 'var(--accent)' : 'var(--border)',
        boxShadow: select?.picked ? 'var(--accent-glow)' : undefined,
        // Capped so long columns don't leave a tail of cards mid-fade.
        animationDelay: `${Math.min(index, 8) * 30}ms`,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {select?.on && (
            <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border text-[10px] font-bold text-white"
              style={{ background: select.picked ? 'var(--accent)' : 'transparent', borderColor: select.picked ? 'var(--accent)' : 'var(--border-strong)' }}>
              {select.picked ? '✓' : ''}
            </span>
          )}
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
      {application.client && (
        <p className="mt-1 truncate text-[12px]" style={{ color: 'var(--text-soft)' }}>Клиент: {application.client.name}</p>
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

      <ApprovalsLine summary={application.checklist_summary} />
      <ForecastLine forecast={application.forecast} />

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

type GroupBy = 'status' | 'client' | 'project';
const GROUPS: Array<{ id: GroupBy; label: string }> = [
  { id: 'status', label: 'По статусу' },
  { id: 'client', label: 'По клиенту' },
  { id: 'project', label: 'По проекту' },
];

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}

/** The tracker noticed a change today, or the portal dates the last change today. */
const changedToday = (a: Application) => isToday(a.last_detected_change_at) || isToday(a.last_changed_date);

export default function DashboardPage() {
  const sync = useSyncEngineSnapshot();
  const [applications, setApplications] = useState<Application[]>([]);
  const [recentDone,   setRecentDone]   = useState<Application[]>([]);
  const [search,          setSearch]          = useState('');
  const [activeTab,       setActiveTab]       = useState<string>('all');
  const [categoryFilter,  setCategoryFilter]  = useState<ServiceCategory | null>(null);
  const [dataLoaded,      setDataLoaded]      = useState(false);
  const [unauthorized,    setUnauthorized]    = useState(false);
  const [groupBy,         setGroupBy]         = useState<GroupBy>('status');
  const [todayOnly,       setTodayOnly]       = useState(false);
  const [projects,        setProjects]        = useState<Map<string, string>>(new Map());
  const [selectMode,      setSelectMode]      = useState(false);
  const [picked,          setPicked]          = useState<Set<string>>(new Set());
  const [bulkBusy,        setBulkBusy]        = useState(false);

  const loadData = useCallback(async () => {
    const [res, archivedRes, projectsRes] = await Promise.all([
      fetch('/api/applications', { cache: 'no-store' }),
      fetch('/api/applications?archived=true', { cache: 'no-store' }),
      fetch('/api/projects', { cache: 'no-store' }).catch(() => null),
    ]);
    const projectList: unknown = projectsRes?.ok ? await projectsRes.json().catch(() => null) : null;
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
      if (Array.isArray(projectList)) setProjects(new Map((projectList as Array<{ id: string; name: string }>).map(pr => [pr.id, pr.name])));
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
    if (todayOnly) result = result.filter(changedToday);
    return result;
  }, [active, recentDone, search, categoryFilter, todayOnly]);

  // «Сегодня»: what moved since midnight.
  const today = useMemo(() => ({
    changed: [...active, ...recentDone].filter(changedToday).length,
    finished: recentDone.filter(a => isToday(a.last_changed_date ?? a.updated_at)).length,
  }), [active, recentDone]);

  // Desktop board: by status (kanban), or one column per client / project.
  const boardColumns = useMemo(() => {
    if (groupBy === 'status') return null;
    const groups = new Map<string, { id: string; label: string; apps: Application[] }>();
    for (const a of filtered) {
      const key = groupBy === 'client' ? a.client?.id ?? '' : a.project_id ?? '';
      const label = groupBy === 'client' ? a.client?.name ?? 'Без клиента' : projects.get(a.project_id ?? '') ?? 'Без проекта';
      const g = groups.get(key) ?? { id: key || 'none', label, apps: [] };
      g.apps.push(a);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => Number(a.id === 'none') - Number(b.id === 'none') || b.apps.length - a.apps.length);
  }, [filtered, groupBy, projects]);

  const select = useMemo(() => ({
    on: selectMode,
    toggle: (id: string) => setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }),
  }), [selectMode]);

  function stopSelecting() {
    setSelectMode(false);
    setPicked(new Set());
  }

  /** Bulk: check now / move to the archive — one request per application, in turn. */
  async function bulk(action: 'check' | 'archive') {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (action === 'archive' && !window.confirm(`Перенести в архив заявлений: ${ids.length}? Проверка по ним остановится.`)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of ids) {
      const r = action === 'check'
        ? await fetch(`/api/applications/${id}/check?manual=true`, { method: 'POST' }).catch(() => null)
        : await fetch(`/api/applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) }).catch(() => null);
      if (r?.ok) ok += 1;
    }
    setBulkBusy(false);
    showToast({
      title: action === 'check' ? `Проверено: ${ok} из ${ids.length}` : `В архив перенесено: ${ok} из ${ids.length}`,
      tone: ok === ids.length ? 'success' : 'warning',
    });
    stopSelecting();
    await loadData();
  }

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
          <button type="button" onClick={() => setTodayOnly(v => !v)} title="Показать только то, что изменилось сегодня"
            className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium"
            style={todayOnly ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            Сегодня: изменений {today.changed}{today.finished ? ` · завершено ${today.finished}` : ''}
          </button>
          <span className="ml-auto hidden shrink-0 items-center gap-1 md:flex">
            {GROUPS.map(g => (
              <button key={g.id} type="button" onClick={() => setGroupBy(g.id)}
                className="rounded-[6px] px-2 py-1 text-[12px] font-medium"
                style={groupBy === g.id ? { background: 'var(--text)', color: 'var(--surface)' } : { background: 'var(--panel)', color: 'var(--text-soft)' }}>
                {g.label}
              </button>
            ))}
            <button type="button" onClick={() => (selectMode ? stopSelecting() : setSelectMode(true))}
              className="ml-2 rounded-[6px] border px-2 py-1 text-[12px] font-medium"
              style={{ borderColor: 'var(--border-strong)', color: selectMode ? 'var(--accent)' : 'var(--text-soft)' }}>
              {selectMode ? 'Отменить выбор' : 'Выбрать'}
            </button>
          </span>
        </div>

        {selectMode && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] px-3 py-2 text-[12px]" style={{ background: 'var(--panel)' }}>
            <span style={{ color: 'var(--text-soft)' }}>Выбрано: <b style={{ color: 'var(--text)' }}>{picked.size}</b> — нажимайте на карточки</span>
            <button type="button" disabled={bulkBusy || picked.size === 0} onClick={() => void bulk('check')}
              className="rounded-[7px] px-3 py-1.5 font-semibold disabled:opacity-50" style={{ background: 'var(--text)', color: 'var(--surface)' }}>
              {bulkBusy ? 'Выполняю…' : 'Проверить сейчас'}
            </button>
            <button type="button" disabled={bulkBusy || picked.size === 0} onClick={() => void bulk('archive')}
              className="rounded-[7px] border px-3 py-1.5 font-semibold disabled:opacity-50" style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}>
              В архив
            </button>
            <button type="button" disabled={bulkBusy} onClick={() => setPicked(new Set(filtered.filter(a => !a.archived).map(a => a.id)))}
              className="font-medium" style={{ color: 'var(--accent)' }}>
              Выбрать все активные
            </button>
          </div>
        )}

        <AttentionStrip />

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
        ) : (boardColumns ?? columns).map((col, colIdx) => (
          <div key={col.id} className="flex min-h-0 w-[288px] min-w-[288px] flex-col animate-slide-up" style={{ animationDelay: `${colIdx * 60}ms` }}>
            {/* Column header */}
            <div className="mb-2.5 flex items-center gap-2 px-1 py-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: boardColumns ? 'var(--accent)' : COLUMNS.find(c => c.id === col.id)?.color }} />
              <span className="flex-1 truncate text-[13px] font-medium" style={{ color: 'var(--text)' }} title={col.label}>
                {!boardColumns && col.id === 'done' ? 'Завершено · 7 дней' : col.label}
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
                      select={{ ...select, picked: picked.has(app.id) }}
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
