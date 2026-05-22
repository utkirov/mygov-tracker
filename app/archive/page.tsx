'use client';

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';

import { ApplicationCard } from '@/components/ApplicationCard';
import type { Application, Project } from '@/types';

export default function ArchivePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [search,       setSearch]       = useState('');

  const loadData = useCallback(async () => {
    const [appRes, projRes] = await Promise.all([
      fetch('/api/applications?archived=true', { cache: 'no-store' }),
      fetch('/api/projects',                   { cache: 'no-store' }),
    ]);
    const [apps, projs] = await Promise.all([
      appRes.json()  as Promise<Application[]>,
      projRes.json() as Promise<Project[]>,
    ]);
    startTransition(() => {
      setApplications(apps);
      setProjects(projs);
    });
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications
      .filter(a => {
        if (!q) return true;
        return [a.application_number, a.object_name, a.service_name, a.organization]
          .join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) =>
        (b.last_changed_date ?? b.updated_at).localeCompare(a.last_changed_date ?? a.updated_at),
      );
  }, [applications, search]);

  return (
    <div className="flex h-[calc(100svh-52px)] flex-col overflow-hidden">
      {/* ── Header ── */}
      <div
        className="border-b px-3 py-2.5 md:px-5 md:py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[13px] font-bold md:text-sm" style={{ color: 'var(--text)' }}>
              Архив
            </h1>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular">{applications.length}</span> завершённых и отложенных
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-[6px] px-2 py-[3px] text-[10px] font-semibold tabular"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {applications.length}
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="w-28 rounded-[9px] px-2.5 py-1.5 text-[12px] outline-none transition md:w-44"
              style={{
                background: 'var(--panel)',
                border:     '1px solid var(--border)',
                color:      'var(--text)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto p-3 md:p-5">
        {filtered.length === 0 ? (
          <div
            className="flex items-center justify-center py-16 text-[13px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {search ? 'Ничего не найдено.' : 'Архив пуст.'}
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
            {filtered.map(application => (
              <ApplicationCard
                key={application.id}
                application={application}
                project={application.project_id
                  ? projects.find(p => p.id === application.project_id)
                  : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
