'use client';

import Link from 'next/link';
import { GitBranch } from 'lucide-react';

import type { Application } from '@/types';
import {
  getApplicationChangeFieldLabel,
  getMyGovStatus,
  isApplicationCheckable,
} from '@/types';
import { formatDate } from '@/lib/format-utils';

interface Props {
  application: Application;
}

function getSyncBadge(application: Application) {
  if (application.sync_state === 'checking') {
    return { label: 'Проверяется', style: { background: 'var(--panel)', color: 'var(--text-soft)' } };
  }
  if (application.last_error) {
    return { label: 'Ошибка', style: { background: 'var(--danger-soft)', color: 'var(--danger)' } };
  }
  if (application.last_change_fields.length > 0) {
    return { label: 'Изменение', style: { background: 'var(--panel)', color: 'var(--text-soft)' } };
  }
  if (!isApplicationCheckable(application)) {
    return { label: 'Остановлено', style: { background: 'var(--panel)', color: 'var(--text-muted)' } };
  }
  return null;
}

export function ApplicationCard({ application }: Props) {
  const syncBadge  = getSyncBadge(application);
  const statusInfo = getMyGovStatus(application.status);

  return (
    <Link
      href={`/applications/${application.id}`}
      className="kanban-card block rounded-[12px] border"
      style={{
        background:  'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow:   'var(--shadow-card)',
      }}
    >
      <div className="p-4">
        {/* Number + sync badge */}
        <div className="mb-2.5 flex items-center gap-2">
          <span className="font-mono text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
            № {application.application_number}
          </span>
          {syncBadge && (
            <span className="ml-auto rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium" style={syncBadge.style}>
              {syncBadge.label}
            </span>
          )}
        </div>

        {/* Name */}
        <p className="text-[14px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
          {application.object_name || application.service_name}
        </p>
        {application.object_name && (
          <p className="mt-1 text-[12px] leading-[1.5]" style={{ color: 'var(--text-soft)' }}>
            {application.service_name}
          </p>
        )}

        {/* Status badge */}
        <div className="mt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--text)' }}>
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: statusInfo.dotColor }} />
            {statusInfo.label}
          </span>
        </div>

        {/* Change fields */}
        {application.last_change_fields.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {application.last_change_fields.map(field => (
              <span
                key={field}
                className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}
              >
                {getApplicationChangeFieldLabel(field)}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div
          className="mt-3.5 flex items-center justify-between gap-2 border-t pt-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="font-mono text-[11px] tabular" style={{ color: 'var(--text-soft)' }}>
            {application.last_changed_date ? formatDate(application.last_changed_date) : '—'}
          </span>
          {application.parent_id ? (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <GitBranch size={11} />
              Цепочка
            </span>
          ) : application.acting_party ? (
            <span className="truncate max-w-[120px] text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {application.acting_party}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
