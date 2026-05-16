'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { ApplicationCard } from '@/components/ApplicationCard';
import type { Application, Project } from '@/types';

export default function ArchivePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');

  const loadData = useEffectEvent(async () => {
    const [applicationsResponse, projectsResponse] = await Promise.all([
      fetch('/api/applications?archived=true', { cache: 'no-store' }),
      fetch('/api/projects', { cache: 'no-store' }),
    ]);

    const [applicationsPayload, projectsPayload] = await Promise.all([
      applicationsResponse.json() as Promise<Application[]>,
      projectsResponse.json() as Promise<Project[]>,
    ]);

    setApplications(applicationsPayload);
    setProjects(projectsPayload);
  });

  useEffect(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return applications
      .filter((application) => {
        if (!normalizedSearch) {
          return true;
        }

        return [
          application.application_number,
          application.object_name,
          application.service_name,
          application.organization,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => (right.last_changed_date ?? right.updated_at).localeCompare(left.last_changed_date ?? left.updated_at));
  }, [applications, search]);

  return (
    <div className="px-4 py-5 md:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Archive workspace
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
            Архив завершённых и отложенных кейсов
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-soft)] md:text-base">
            Здесь остаются записи вне активного мониторинга. Они доступны для поиска, просмотра истории и возврата обратно в рабочий поток.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по архиву"
              className="w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <div className="rounded-[24px] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--text-soft)]">
              В архиве: <span className="font-semibold text-[var(--text)]">{applications.length}</span>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
          <div className="space-y-4">
            {filtered.length === 0 && (
              <div className="rounded-[24px] bg-[var(--panel-strong)] p-6 text-sm leading-6 text-[var(--text-soft)]">
                Архив пока пуст или под текущий поиск ничего не подошло.
              </div>
            )}

            {filtered.map((application) => {
              const project = application.project_id
                ? projects.find((entry) => entry.id === application.project_id)
                : undefined;

              return (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  project={project}
                />
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
