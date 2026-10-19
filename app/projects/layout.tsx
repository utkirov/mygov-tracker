'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { showToast } from '@/lib/toast';
import type { Application, Project } from '@/types';
import { PROJECT_COLORS } from '@/types';
import { PROJECTS_CHANGED_EVENT } from '@/lib/project-events';


export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [apps,     setApps]     = useState<Application[]>([]);
  const [loaded,   setLoaded]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectList, active, archived] = await Promise.all([
        fetch('/api/projects', { cache: 'no-store' }).then(r => r.json()) as Promise<Project[]>,
        fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()) as Promise<Application[]>,
        fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()) as Promise<Application[]>,
      ]);
      startTransition(() => {
        setProjects(Array.isArray(projectList) ? projectList : []);
        setApps([...(Array.isArray(active) ? active : []), ...(Array.isArray(archived) ? archived : [])]);
        setLoaded(true);
      });
    } catch {
      startTransition(() => setLoaded(true));
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(PROJECTS_CHANGED_EVENT, load);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, load);
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of apps) if (a.project_id) map.set(a.project_id, (map.get(a.project_id) ?? 0) + 1);
    return map;
  }, [apps]);

  // /projects on its own opens the first project.
  useEffect(() => {
    if (loaded && pathname === '/projects' && projects.length > 0) {
      router.replace(`/projects/${projects[0].id}`);
    }
  }, [loaded, pathname, projects, router]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length] }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось создать проект');
      setNewName('');
      setCreating(false);
      await load();
      router.push(`/projects/${(result as Project).id}`);
    } catch (error) {
      showToast({ title: 'Проект не создан', description: error instanceof Error ? error.message : 'Повторите попытку.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:px-10 md:py-6">
        <aside className="shrink-0 rounded-[14px] border p-4 md:sticky md:top-0 md:w-[300px]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Проекты</h2>
            <button type="button" aria-label="Новый проект" onClick={() => setCreating(v => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] transition active:scale-95"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Plus size={16} />
            </button>
          </div>

          {creating && (
            <form className="mb-3 flex gap-2" onSubmit={e => { e.preventDefault(); void handleCreate(); }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название проекта"
                className="min-w-0 flex-1 rounded-[8px] border px-3 py-2 text-[13px] outline-none"
                style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              <button type="submit" disabled={saving || !newName.trim()}
                className="rounded-[8px] px-3 text-[12px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>
                {saving ? '…' : 'Создать'}
              </button>
            </form>
          )}

          {!loaded ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 rounded-[8px] animate-shimmer" />)}</div>
          ) : projects.length === 0 ? (
            <p className="py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Проектов пока нет. Нажмите «+», чтобы сгруппировать заявления по объекту или клиенту.
            </p>
          ) : (
            <nav className="flex flex-col gap-1">
              {projects.map(project => {
                const active = pathname === `/projects/${project.id}`;
                return (
                  <Link key={project.id} href={`/projects/${project.id}`}
                    className="flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13px] transition hover:bg-[var(--panel)]"
                    style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--text)' }}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{project.name}</span>
                    <span className="text-[12px] tabular" style={{ color: 'var(--text-muted)' }}>{counts.get(project.id) ?? 0}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
