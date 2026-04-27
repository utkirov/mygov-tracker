// app/dashboard/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Application } from '@/types';
import { getStatusType } from '@/types';
import { ApplicationCard } from '@/components/ApplicationCard';

type Filter = 'all' | 'action_required' | 'in_progress' | 'completed';

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/applications')
      .then(r => r.json())
      .then(setApplications);
  }, []);

  const filtered = applications
    .filter(a => filter === 'all' || getStatusType(a.acting_party, a.status) === filter)
    .filter(a =>
      !search ||
      a.application_number.includes(search) ||
      a.object_name.toLowerCase().includes(search.toLowerCase()) ||
      a.service_name.toLowerCase().includes(search.toLowerCase())
    );

  const sorted = [...filtered].sort((a, b) => {
    const order = { action_required: 0, in_progress: 1, completed: 2 };
    return order[getStatusType(a.acting_party, a.status)] - order[getStatusType(b.acting_party, b.status)];
  });

  const counts = {
    all: applications.length,
    action_required: applications.filter(a => getStatusType(a.acting_party, a.status) === 'action_required').length,
    in_progress: applications.filter(a => getStatusType(a.acting_party, a.status) === 'in_progress').length,
    completed: applications.filter(a => getStatusType(a.acting_party, a.status) === 'completed').length,
  };

  const filterLabels: { key: Filter; label: string; style: string }[] = [
    { key: 'all', label: `Все (${counts.all})`, style: 'bg-blue-600 text-white' },
    { key: 'action_required', label: `Требуют действия (${counts.action_required})`, style: 'bg-red-100 text-red-700' },
    { key: 'in_progress', label: `В ожидании (${counts.in_progress})`, style: 'bg-yellow-100 text-yellow-800' },
    { key: 'completed', label: `Завершены (${counts.completed})`, style: 'bg-green-100 text-green-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">my.gov tracker</h1>
        <Link href="/add">
          <button className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
            + Новая
          </button>
        </Link>
      </div>

      <div className="px-4 py-3 bg-white border-b">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Поиск по объекту, номеру или услуге..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="px-4 py-2 bg-gray-50 border-b flex gap-2 overflow-x-auto">
        {filterLabels.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition
              ${filter === f.key ? f.style : 'bg-gray-200 text-gray-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 flex flex-col gap-3 max-w-2xl mx-auto">
        {sorted.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">
            {applications.length === 0 ? 'Нет заявок. Добавьте первую!' : 'Ничего не найдено'}
          </p>
        )}
        {sorted.map(app => (
          <ApplicationCard key={app.id} application={app} />
        ))}
      </div>
    </div>
  );
}
