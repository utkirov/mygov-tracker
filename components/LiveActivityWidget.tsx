'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, X, Zap } from 'lucide-react';

import type { Application } from '@/types';
import { getApplicationChangeFieldLabel } from '@/types';
import type { SyncEngineSnapshot } from '@/lib/sync-engine';

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ч`;
  return `${Math.floor(hrs / 24)}д`;
}

function statusDot(status: string): string {
  const s = status.trim().toLowerCase();
  const map: Record<string, string> = {
    'новое':                            '#60A5FA',
    'черновик':                         '#60A5FA',
    'в обработке':                      '#FBBF24',
    'переотправлена':                   '#FBBF24',
    'в ожидании другого заявителя':     '#F87171',
    'в ожидании оплаты':                '#F87171',
    'обработано':                       '#34D399',
    'отклонено':                        '#FB7185',
    'аннулировано':                     '#94A3B8',
  };
  return map[s] ?? '#FBBF24';
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  applications: Application[];
  sync: SyncEngineSnapshot;
}

// ─── component ────────────────────────────────────────────────────────────────

export function LiveActivityWidget({ applications, sync }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const currentApp = useMemo(
    () => (sync.currentApplicationId
      ? applications.find(a => a.id === sync.currentApplicationId) ?? null
      : null),
    [applications, sync.currentApplicationId],
  );

  const recentChanges = useMemo(() =>
    applications
      .filter(a => a.last_change_fields.length > 0 && a.last_detected_change_at)
      .sort((a, b) =>
        (b.last_detected_change_at ?? '').localeCompare(a.last_detected_change_at ?? ''),
      )
      .slice(0, 6),
  [applications]);

  const progressPct = useMemo(() => {
    const total = sync.queueApplicationIds.length + 1;
    const remaining = sync.queueLength;
    if (!sync.isRunning || total === 0) return 0;
    return Math.max(8, Math.round((1 - remaining / total) * 100));
  }, [sync.isRunning, sync.queueApplicationIds.length, sync.queueLength]);

  const hasActivity = sync.isRunning || recentChanges.length > 0;
  if (!hasActivity || dismissed) return null;

  // inline responsive positioning via a <style> tag
  const widgetStyle: React.CSSProperties = {
    position: 'fixed',
    right: '12px',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
    zIndex: 50,
    animation: 'fade-in-up 200ms ease both',
  };

  return (
    <div style={widgetStyle}>
      <style>{`
        @media (min-width: 768px) {
          .lw-root { bottom: 24px !important; right: 20px !important; }
        }
      `}</style>
      <div
        className="lw-root"
        style={widgetStyle}
      >
        <div
          className="w-[224px] overflow-hidden rounded-[14px] md:w-[244px]"
          style={{
            background:     'var(--surface)',
            border:         '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))',
            boxShadow:      'var(--shadow-card), 0 16px 48px rgba(0,0,0,0.25)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center"
            style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
          >
            <button
              onClick={() => setCollapsed(c => !c)}
              className="flex flex-1 items-center gap-2 px-3.5 py-2.5 transition hover:bg-white/5 active:bg-white/10"
            >
              {sync.isRunning ? (
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full bg-emerald-400"
                  style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}
                />
              ) : (
                <Zap size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <span
                className="flex-1 text-left text-[11px] font-semibold tracking-wide"
                style={{ color: 'var(--text-soft)' }}
              >
                {sync.isRunning ? 'Идёт проверка' : 'Последние изменения'}
              </span>
              {collapsed
                ? <ChevronUp   size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                : <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              }
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center transition hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
              title="Скрыть"
            >
              <X size={11} />
            </button>
          </div>

          {!collapsed && (
            <>
              {/* ── Live check section ── */}
              {sync.isRunning && (
                <div
                  className="px-3.5 py-3"
                  style={{ borderBottom: recentChanges.length > 0 ? '1px solid var(--border)' : 'none' }}
                >
                  <p
                    className="mb-2 text-[9px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Проверяется сейчас
                  </p>

                  {currentApp ? (
                    <Link href={`/applications/${currentApp.id}`} className="group block">
                      <p className="truncate text-[12px] font-semibold leading-[1.4] transition"
                        style={{ color: 'var(--text)' }}>
                        {currentApp.object_name || currentApp.service_name}
                      </p>
                      <p className="font-mono text-[9px] tabular" style={{ color: 'var(--text-muted)' }}>
                        № {currentApp.application_number}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Запрос к my.gov…
                    </p>
                  )}

                  {/* Progress bar */}
                  <div
                    className="mt-2.5 overflow-hidden rounded-full"
                    style={{ height: 2, background: 'var(--border)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        background:  'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff))',
                        width:       `${progressPct}%`,
                        transition:  'width 0.6s ease',
                      }}
                    />
                  </div>

                  {sync.queueLength > 0 && (
                    <p className="mt-1.5 text-[10px] tabular" style={{ color: 'var(--text-muted)' }}>
                      Ещё {sync.queueLength} в очереди
                    </p>
                  )}
                </div>
              )}

              {/* ── Recent changes section ── */}
              {recentChanges.length > 0 && (
                <div className="px-3.5 py-3">
                  <p
                    className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {sync.isRunning ? 'Изменения' : 'Последние изменения'}
                  </p>

                  <div className="space-y-2.5">
                    {recentChanges.map(app => (
                      <Link
                        key={app.id}
                        href={`/applications/${app.id}`}
                        className="group flex items-start gap-2"
                      >
                        <div
                          className="mt-[4px] h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ background: statusDot(app.status) }}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-[11px] font-semibold leading-[1.35] transition"
                            style={{ color: 'var(--text-soft)' }}
                          >
                            {app.object_name || app.service_name}
                          </p>
                          <p
                            className="mt-[2px] text-[9px] leading-[1.3]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {app.last_change_fields.slice(0, 2).map(f => getApplicationChangeFieldLabel(f)).join(', ')}
                          </p>
                        </div>
                        <span className="shrink-0 text-[9px] tabular" style={{ color: 'var(--text-muted)' }}>
                          {timeAgo(app.last_detected_change_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
