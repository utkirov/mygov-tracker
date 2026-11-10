'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { ProjectPipeline } from '@/components/ProjectPipeline';
import { pipelineProgress, projectPipeline } from '@/lib/project-pipeline';
import type { Application, Project } from '@/types';

/** /projects: every project with its chain АПЗ → ПСД → СМР → приёмка → кадастр and what is in work. */
export default function ProjectsIndexPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [apps, setApps] = useState<Application[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/projects', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Project[]>,
      fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
      fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()).catch(() => []) as Promise<Application[]>,
    ]).then(([p, a, b]) => startTransition(() => {
      setProjects(Array.isArray(p) ? p : []);
      setApps([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
    }));
  }, []);

  const rows = useMemo(() => (projects ?? []).map(project => {
    const mine = apps.filter(a => a.project_id === project.id);
    const steps = projectPipeline(mine);
    return { project, steps, progress: pipelineProgress(steps), total: mine.length, active: mine.filter(a => !a.archived).length };
  }).sort((a, b) => b.active - a.active || b.total - a.total), [projects, apps]);

  const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' };
  if (projects === null) {
    return <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-[14px] animate-shimmer" />)}</div>;
  }
  if (projects.length === 0) {
    return (
      <div className="rounded-[14px] border p-8 text-center text-[13px]" style={{ ...cardStyle, color: 'var(--text-muted)' }}>
        Проектов пока нет. Создайте проект слева — и привязывайте к нему заявления одного объекта.
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>Проекты</h1>
      <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
        {projects.length} проектов. У каждого — путь объекта: АПЗ → согласование ПСД → разрешение на СМР → приёмка → кадастр.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(({ project, steps, progress, total, active }) => (
          <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-[14px] border p-4 transition hover:shadow-[var(--shadow-hover)]" style={cardStyle}>
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold" style={{ color: 'var(--text)' }}>{project.name}</span>
              <span className="shrink-0 text-[12px] tabular-nums" style={{ color: 'var(--text-muted)' }}>шагов {progress.done} из {progress.total}</span>
            </div>
            <div className="mt-3"><ProjectPipeline steps={steps} compact /></div>
            <p className="mt-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Заявлений: {total} · в работе: <b style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{active}</b>
              {steps.some(s => s.state === 'rejected') ? <span style={{ color: 'var(--danger)' }}> · есть отказ без новой подачи</span> : null}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
