'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Application, Project } from '@/types';
import { getStatusType } from '@/types';
import { ApplicationCard } from '@/components/ApplicationCard';
import { useTheme } from '@/components/ThemeProvider';

type StatusFilter = 'all' | 'action_required' | 'in_progress' | 'completed';

export default function DashboardPage() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/applications').then(r => r.json()).then(setApplications);
    fetch('/api/projects').then(r => r.json()).then(setProjects);
  }, []);

  const filtered = applications
    .filter(a => statusFilter === 'all' || getStatusType(a.acting_party, a.status) === statusFilter)
    .filter(a => projectFilter === null || a.project_id === projectFilter)
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

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return 'Без проекта';
    return projects.find(p => p.id === projectId)?.name ?? 'Проект';
  };

  const statusFilters = [
    { key: 'all' as const, label: `Все (${counts.all})` },
    { key: 'action_required' as const, label: `Требуют действия (${counts.action_required})` },
    { key: 'in_progress' as const, label: `В ожидании (${counts.in_progress})` },
    { key: 'completed' as const, label: `Завершены (${counts.completed})` },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Header */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-4 md:py-5 flex items-center justify-between gap-3">
        <h1 className="font-bold text-xl md:text-2xl text-[var(--text)]">my.gov tracker</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="text-lg text-[var(--text2)] hover:text-[var(--text)] transition"
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link href="/add" className="text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-2 rounded-lg transition font-medium">
            + Новая
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-3 md:py-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Поиск..."
          className="w-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] placeholder-[var(--text2)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Status Filters */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-3 flex gap-2 overflow-x-auto">
        {statusFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition
              ${statusFilter === f.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] hover:border-[var(--text2)]'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Project Filters */}
      {projects.length > 0 && (
        <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setProjectFilter(null)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition border
              ${projectFilter === null
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--text2)]'}`}
          >
            Все проекты
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setProjectFilter(p.id)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition border
                ${projectFilter === p.id
                  ? 'text-white'
                  : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--text2)]'}`}
              style={projectFilter === p.id ? { background: p.color } : {}}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-3 max-w-4xl mx-auto w-full">
        {sorted.length === 0 && (
          <div className="flex items-center justify-center py-12 md:py-20 text-center">
            <p className="text-[var(--text2)] text-sm">
              {applications.length === 0 ? 'Нет заявок. Добавьте первую!' : 'Ничего не найдено'}
            </p>
          </div>
        )}
        {sorted.map(app => {
          const project = app.project_id ? projects.find(p => p.id === app.project_id) : undefined;
          return (
            <ApplicationCard key={app.id} application={app} project={project} />
          );
        })}
      </div>
    </div>
  );
}
