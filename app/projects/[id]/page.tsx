'use client';

import { startTransition, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';

import { formatDate } from '@/lib/format-utils';
import { showToast } from '@/lib/toast';
import type { Application, Project } from '@/types';
import { getMyGovStatus, PROJECT_COLORS } from '@/types';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [apps,    setApps]    = useState<Application[]>([]);
  const [loaded,  setLoaded]  = useState(false);

  const [editing,       setEditing]       = useState(false);
  const [editName,      setEditName]      = useState('');
  const [editColor,     setEditColor]     = useState('');
  const [savingEdit,    setSavingEdit]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/projects',                           { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${id}/applications`,        { cache: 'no-store' }).then(r => r.json()),
    ]).then(([projects, applications]: [Project[], Application[]]) => {
      const found = projects.find(p => p.id === id) ?? null;
      startTransition(() => {
        setProject(found);
        setApps(applications);
        setLoaded(true);
      });
    }).catch(() => {
      startTransition(() => setLoaded(true));
    });
  }, [id]);

  function startEditing() {
    if (!project) return;
    setEditName(project.name);
    setEditColor(project.color);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!project || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось сохранить проект');
      setProject(result as Project);
      setEditing(false);
      showToast({ title: 'Проект обновлён', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Не удалось сохранить', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось удалить проект');
      }
      router.push('/dashboard');
    } catch (error) {
      showToast({ title: 'Удаление не выполнено', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex h-[calc(100svh-56px)] items-center justify-center text-[13px]"
        style={{ color: 'var(--text-muted)' }}>
        Загрузка…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-[calc(100svh-56px)] flex-col items-center justify-center gap-3 text-[13px]"
        style={{ color: 'var(--text-muted)' }}>
        <p>Проект не найден</p>
        <Link
          href="/dashboard"
          className="rounded-[9px] px-4 py-2 text-[12px] font-semibold text-white transition active:scale-95"
          style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
        >
          На доску заявлений
        </Link>
      </div>
    );
  }

  const active   = apps.filter(a => !a.archived);
  const archived = apps.filter(a =>  a.archived);

  return (
    <div className="overflow-y-auto px-4 py-4 md:px-6 md:py-6 animate-fade-up">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">

        {/* ── Header card ── */}
        <div className="rounded-[12px] border p-4 md:p-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition hover:bg-[var(--panel)] active:scale-90"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: editColor }} />
                    <p className="text-[10px] font-semibold " style={{ color: 'var(--text-muted)' }}>
                      Изменить проект
                    </p>
                  </div>
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void handleSaveEdit();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    placeholder="Название проекта"
                    className="w-full rounded-[10px] border px-3 py-2 text-[14px] font-semibold outline-none transition focus:border-[var(--accent)]"
                    style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  />
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditColor(color)}
                        aria-label={`Цвет ${color}`}
                        className="h-7 w-7 rounded-full transition"
                        style={{ backgroundColor: color, boxShadow: editColor === color ? `0 0 0 3px ${color}44` : 'none' }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleSaveEdit()}
                      disabled={savingEdit || !editName.trim()}
                      className="rounded-[9px] px-3.5 py-2 text-[12px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
                      style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
                    >
                      {savingEdit ? 'Сохраняю…' : 'Сохранить'}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      disabled={savingEdit}
                      className="rounded-[9px] border px-3.5 py-2 text-[12px] font-medium transition active:scale-95 disabled:opacity-60"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                    <p className="text-[10px] font-semibold " style={{ color: 'var(--text-muted)' }}>
                      Проект
                    </p>
                  </div>
                  <h1 className="mt-1 text-[20px] font-semibold leading-[1.25] tracking-[-0.02em] md:text-[24px]"
                    style={{ color: 'var(--text)' }}>
                    {project.name}
                  </h1>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <span className="rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
                      style={{ background: `${project.color}1A`, color: project.color }}>
                      {apps.length} заявлений всего
                    </span>
                    {active.length > 0 && (
                      <span className="rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
                        style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>
                        {active.length} активных
                      </span>
                    )}
                    {archived.length > 0 && (
                      <span className="rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
                        style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
                        {archived.length} в архиве
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={startEditing}
                      className="rounded-[9px] border px-3 py-1.5 text-[12px] font-medium transition active:scale-95"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                    >
                      Изменить
                    </button>
                    {confirmDelete ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Удалить проект?</span>
                        <button
                          onClick={() => void handleDelete()}
                          disabled={deleting}
                          className="rounded-[9px] px-3 py-1.5 text-[12px] font-semibold transition active:scale-95 disabled:opacity-60"
                          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                        >
                          {deleting ? 'Удаляю…' : 'Да'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="rounded-[9px] border px-3 py-1.5 text-[12px] font-medium transition active:scale-95 disabled:opacity-60"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                        >
                          Нет
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="rounded-[9px] border px-3 py-1.5 text-[12px] font-medium transition active:scale-95"
                        style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            {!editing && (
              <Link
                href={`/add?project_id=${project.id}`}
                className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95 hover:brightness-110"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Новая заявка</span>
              </Link>
            )}
          </div>
        </div>

        {/* ── Timeline ── */}
        <div className="rounded-[12px] border p-4 md:p-5"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
          <h2 className="mb-4 text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            История заявлений
          </h2>

          {apps.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px]"
                style={{ background: 'var(--panel)' }}>
                <span className="text-xl">📂</span>
              </div>
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                К этому проекту ещё нет заявлений
              </p>
              <Link
                href={`/add?project_id=${project.id}`}
                className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white transition active:scale-95"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
              >
                Добавить первую
              </Link>
            </div>
          ) : (
            <div className="relative pl-8">
              {/* Vertical line */}
              <div
                className="absolute left-[7px] top-2 bottom-4 w-[2px] rounded-full"
                style={{ background: project.color }}
              />

              <div className="space-y-2">
                {apps.map((app, idx) => {
                  const statusInfo = getMyGovStatus(app.status);
                  const isActive   = !app.archived;
                  return (
                    <Link
                      key={app.id}
                      href={`/applications/${app.id}`}
                      className="relative flex gap-3 rounded-[12px] p-3 transition-colors hover:bg-[var(--panel)] animate-slide-up group"
                      style={{ animationDelay: `${idx * 45}ms` }}
                    >
                      {/* Timeline dot */}
                      <div
                        className="absolute left-[-25px] top-[14px] h-[14px] w-[14px] rounded-full border-2 z-10 shrink-0"
                        style={{
                          background:  isActive ? project.color : 'var(--panel)',
                          borderColor: project.color,
                          boxShadow:   isActive ? `0 0 0 3px ${project.color}22` : 'none',
                        }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold leading-tight"
                              style={{ color: 'var(--text)' }}>
                              {app.object_name || app.service_name}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              № {app.application_number}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {app.archived && (
                              <span className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: 'var(--panel-strong)', color: 'var(--text-muted)' }}>
                                Архив
                              </span>
                            )}
                            <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>
                              {statusInfo.label}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(app.last_changed_date ?? app.created_at)}
                          </p>
                          {app.last_change_fields.length > 0 && (
                            <span className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>
                              изменение
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
