'use client';

import Link from 'next/link';

import type { Application, Project } from '@/types';
import {
  getApplicationChangeFieldLabel,
  getMyGovStatus,
  isApplicationCheckable,
} from '@/types';
import { formatDate } from '@/lib/format-utils';

interface Props {
  application: Application;
  project?: Project;
}

// Map status → color pair
function statusColors(status: string): { bg: string; text: string } {
  const s = status.trim().toLowerCase();
  const map: Record<string, { bg: string; text: string }> = {
    'новое':                            { bg: 'rgba(96,165,250,0.14)',   text: '#93C5FD' },
    'черновик':                         { bg: 'rgba(96,165,250,0.14)',   text: '#93C5FD' },
    'в обработке':                      { bg: 'rgba(251,191,36,0.14)',   text: '#FCD34D' },
    'переотправлена':                   { bg: 'rgba(251,191,36,0.14)',   text: '#FCD34D' },
    'в ожидании другого заявителя':     { bg: 'rgba(248,113,113,0.14)', text: '#FCA5A5' },
    'в ожидании оплаты':                { bg: 'rgba(248,113,113,0.14)', text: '#FCA5A5' },
    'обработано':                       { bg: 'rgba(52,211,153,0.14)',   text: '#6EE7B7' },
    'отклонено':                        { bg: 'rgba(251,113,133,0.14)', text: '#FDA4AF' },
    'аннулировано':                     { bg: 'rgba(148,163,184,0.14)', text: '#94A3B8' },
  };
  return map[s] ?? { bg: 'var(--accent-soft)', text: 'var(--accent)' };
}

function getSyncBadge(application: Application) {
  if (application.sync_state === 'checking') {
    return { label: 'Проверяется', style: { background: 'var(--accent-soft)', color: 'var(--accent)' } };
  }
  if (application.last_error) {
    return { label: 'Ошибка', style: { background: 'var(--danger-soft)', color: 'var(--danger)' } };
  }
  if (application.last_change_fields.length > 0) {
    return { label: 'Изменение', style: { background: 'var(--warning-soft)', color: 'var(--warning)' } };
  }
  if (!isApplicationCheckable(application)) {
    return { label: 'Остановлено', style: { background: 'var(--panel)', color: 'var(--text-muted)' } };
  }
  return null;
}

export function ApplicationCard({ application, project }: Props) {
  const syncBadge  = getSyncBadge(application);
  const statusInfo = getMyGovStatus(application.status);
  const colors     = statusColors(application.status);

  return (
    <Link
      href={`/applications/${application.id}`}
      className="block rounded-[12px] border p-3.5 transition-all duration-150 active:scale-[0.98] md:hover:-translate-y-[2px]"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Number + badge row */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-mono text-[10px] tabular" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
          № {application.application_number}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {syncBadge && (
            <span className="rounded-[5px] px-1.5 py-[2px] text-[10px] font-semibold" style={syncBadge.style}>
              {syncBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* Name */}
      <p className="text-[13px] font-semibold leading-[1.4]" style={{ color: 'var(--text)' }}>
        {application.object_name || application.service_name}
      </p>
      {application.object_name && (
        <p className="mt-0.5 text-[11px] leading-[1.4]" style={{ color: 'var(--text-muted)' }}>
          {application.service_name}
        </p>
      )}

      {/* Status badge */}
      <div className="mt-2.5">
        <span
          className="inline-block rounded-[6px] px-2 py-[3px] text-[11px] font-semibold"
          style={{ background: colors.bg, color: colors.text }}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Change fields */}
      {application.last_change_fields.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {application.last_change_fields.map(field => (
            <span
              key={field}
              className="rounded-[5px] px-1.5 py-[2px] text-[10px] font-medium"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
            >
              {getApplicationChangeFieldLabel(field)}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-[10px] tabular" style={{ color: 'var(--text-muted)' }}>
          {application.last_changed_date ? formatDate(application.last_changed_date) : '—'}
        </span>
        {project ? (
          <span
            className="rounded-full px-2 py-[2px] text-[10px] font-medium"
            style={{ background: `${project.color}20`, color: project.color }}
          >
            {project.name}
          </span>
        ) : application.acting_party ? (
          <span className="truncate max-w-[100px] text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {application.acting_party}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
