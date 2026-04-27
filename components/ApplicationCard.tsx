'use client';
// components/ApplicationCard.tsx
import Link from 'next/link';
import { useState } from 'react';
import type { Application } from '@/types';
import { getStatusType } from '@/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  application: Application;
  onStatusUpdated: (updated: Application) => void;
}

export function ApplicationCard({ application, onStatusUpdated }: Props) {
  const [checking, setChecking] = useState(false);
  const type = getStatusType(application.acting_party, application.status);

  const borderStyle = {
    action_required: 'border-red-300 bg-red-50',
    in_progress: 'border-gray-200 bg-white',
    completed: 'border-green-200 bg-green-50 opacity-80',
  }[type];

  async function handleCheck(e: React.MouseEvent) {
    e.preventDefault();
    setChecking(true);
    const res = await fetch(`/api/applications/${application.id}/check`, { method: 'POST' });
    if (res.ok) {
      const { application: updated } = await res.json();
      onStatusUpdated(updated);
    }
    setChecking(false);
  }

  return (
    <Link href={`/applications/${application.id}`}>
      <div className={`border rounded-xl p-4 cursor-pointer hover:shadow-sm transition ${borderStyle}`}>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 font-mono">№ {application.application_number}</div>
            <div className="text-sm font-semibold text-gray-900 mt-1 line-clamp-2">{application.service_name}</div>
            <div className="text-xs text-gray-500 mt-1">{application.organization}</div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={application.status} acting_party={application.acting_party} />
            {application.current_action && (
              <div className="text-xs text-gray-500">{application.current_action}</div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs text-gray-400">
            {application.last_changed_date
              ? new Date(application.last_changed_date).toLocaleDateString('ru-RU')
              : new Date(application.submission_date ?? application.created_at).toLocaleDateString('ru-RU')}
          </div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="text-xs border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            {checking ? '...' : '↻ Проверить'}
          </button>
        </div>
      </div>
    </Link>
  );
}
