'use client';
// components/ApplicationCard.tsx
import Link from 'next/link';
import type { Application } from '@/types';
import { getStatusType } from '@/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  application: Application;
}

export function ApplicationCard({ application }: Props) {
  const type = getStatusType(application.acting_party, application.status);

  const borderStyle = {
    action_required: 'border-red-300 bg-red-50',
    in_progress: 'border-gray-200 bg-white',
    completed: 'border-green-200 bg-green-50 opacity-80',
  }[type];

  return (
    <Link href={`/applications/${application.id}`}>
      <div className={`border rounded-xl p-4 cursor-pointer hover:shadow-sm transition ${borderStyle}`}>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 font-mono">№ {application.application_number}</div>
            {application.object_name && (
              <div className="text-sm font-bold text-gray-900 mt-1 line-clamp-2">{application.object_name}</div>
            )}
            <div className={`text-xs text-gray-500 line-clamp-2 ${application.object_name ? 'mt-0.5' : 'mt-1 font-semibold text-gray-900 text-sm'}`}>
              {application.service_name}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={application.status} acting_party={application.acting_party} />
            {application.current_action && (
              <div className="text-xs text-gray-500 text-right">{application.current_action}</div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs text-gray-400">
            {application.last_changed_date
              ? new Date(application.last_changed_date).toLocaleDateString('ru-RU')
              : new Date(application.submission_date ?? application.created_at).toLocaleDateString('ru-RU')}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/applications/${application.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              Оригинал ↗
            </a>
            <span className="text-xs text-blue-600 font-medium">
              Открыть →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
