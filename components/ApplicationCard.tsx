'use client';
import Link from 'next/link';
import type { Application, Project } from '@/types';
import { getStatusType } from '@/types';

interface Props {
  application: Application;
  project?: Project;
}

export function ApplicationCard({ application, project }: Props) {
  const type = getStatusType(application.acting_party, application.status);

  const statusStyle = {
    action_required: { dot: '#ff3b30', badge: 'bg-red-500/10 text-red-500' },
    in_progress:     { dot: '#ff9500', badge: 'bg-orange-500/10 text-orange-500' },
    completed:       { dot: '#34c759', badge: 'bg-green-500/10 text-green-500' },
  }[type];

  const date = application.last_changed_date ?? application.submission_date ?? application.created_at;

  return (
    <div className="relative card overflow-hidden transition hover:shadow-md active:scale-[0.99]">
      {/* project color accent bar */}
      {project && (
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: project.color }} />
      )}

      <Link href={`/applications/${application.id}`} className="block p-4" style={project ? { paddingLeft: '1.25rem' } : {}}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[var(--text3)]">№ {application.application_number}</span>
              {project && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: project.color + '20', color: project.color }}>
                  {project.name}
                </span>
              )}
            </div>
            {application.object_name ? (
              <>
                <div className="text-sm font-semibold text-[var(--text)] leading-snug">{application.object_name}</div>
                <div className="text-xs text-[var(--text2)] mt-0.5 line-clamp-1">{application.service_name}</div>
              </>
            ) : (
              <div className="text-sm font-semibold text-[var(--text)] leading-snug line-clamp-2">{application.service_name}</div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${statusStyle.badge}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusStyle.dot }} />
              {application.status}
            </span>
            {application.current_action && (
              <span className="text-xs text-[var(--text3)] text-right max-w-[120px] line-clamp-1">{application.current_action}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text3)]">
            {new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-3">
            <a
              href={`/api/applications/${application.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-[var(--text2)] hover:text-[var(--accent)] transition"
            >
              Оригинал ↗
            </a>
            <span className="text-xs text-[var(--accent)] font-medium">Открыть →</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
