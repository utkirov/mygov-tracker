'use client';

import type { Project, StatusType } from '@/types';

type StatusFilter = 'all' | StatusType;

interface Props {
  search: string;
  statusFilter: StatusFilter;
  statusFilters: Array<{ key: StatusFilter; label: string }>;
  projects: Project[];
  projectFilter: string | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onProjectFilterChange: (value: string | null) => void;
}

export default function FiltersSection({
  search,
  statusFilter,
  statusFilters,
  projects,
  projectFilter,
  onSearchChange,
  onStatusFilterChange,
  onProjectFilterChange,
}: Props) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
        Быстрые фильтры
      </p>
      <div className="mt-4 space-y-3">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по номеру, объекту, услуге"
          className="w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
        />

        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => onStatusFilterChange(filter.key)}
              className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                statusFilter === filter.key
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onProjectFilterChange(null)}
              className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                projectFilter === null
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
              }`}
            >
              Все проекты
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onProjectFilterChange(project.id)}
                className="rounded-full px-3 py-2 text-xs font-medium text-white transition"
                style={{
                  backgroundColor: projectFilter === project.id ? project.color : `${project.color}B3`,
                }}
              >
                {project.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
