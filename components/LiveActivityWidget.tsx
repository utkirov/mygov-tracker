'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

import type { Application } from '@/types';
import { getApplicationChangeFieldLabel, getMyGovStatus } from '@/types';
import type { SyncEngineSnapshot } from '@/lib/sync-engine';
import { formatTimeAgo } from '@/lib/format-utils';

interface Props {
  applications: Application[];
  sync: SyncEngineSnapshot;
}

/**
 * Floating summary of the latest detected changes. The server runs the check
 * cycle, so while it's busy we only say so — there is no per-application
 * queue on the client to show progress for.
 */
export function LiveActivityWidget({ applications, sync }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const recentChanges = useMemo(() =>
    applications
      .filter(a => a.last_change_fields.length > 0 && a.last_detected_change_at)
      .sort((a, b) => (b.last_detected_change_at ?? '').localeCompare(a.last_detected_change_at ?? ''))
      .slice(0, 5),
  [applications]);

  if ((!sync.isRunning && recentChanges.length === 0) || dismissed) return null;

  return (
    <div className="fixed right-3 z-50 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] md:bottom-6 md:right-5">
      <div className="w-[260px] overflow-hidden rounded-[12px] border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-float)' }}>
        <div className="flex items-center" style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}>
          <button onClick={() => setCollapsed(c => !c)}
            className="flex flex-1 items-center gap-2 px-3.5 py-2.5 transition hover:bg-[var(--panel)]">
            {sync.isRunning && (
              <span className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: 'var(--warning)', animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
            )}
            <span className="flex-1 text-left text-[13px] font-medium" style={{ color: 'var(--text)' }}>
              {sync.isRunning ? 'Идёт проверка…' : 'Последние изменения'}
            </span>
            {collapsed
              ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
              : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
          </button>
          <button onClick={() => setDismissed(true)} title="Скрыть"
            className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-[var(--panel)]"
            style={{ color: 'var(--text-muted)' }}>
            <X size={13} />
          </button>
        </div>

        {!collapsed && recentChanges.length > 0 && (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recentChanges.map(app => (
              <Link key={app.id} href={`/applications/${app.id}`}
                className="flex items-start gap-2.5 px-3.5 py-2.5 transition hover:bg-[var(--panel)]">
                <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: getMyGovStatus(app.status).dotColor }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium" style={{ color: 'var(--text)' }}>
                    {app.object_name || app.service_name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {app.last_change_fields.map(f => getApplicationChangeFieldLabel(f)).join(', ')}
                  </p>
                </div>
                <span className="shrink-0 pt-0.5 text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
                  {formatTimeAgo(app.last_detected_change_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
