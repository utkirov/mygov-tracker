'use client';

import { useEffect, useState } from 'react';

import type { Project } from '@/types';
import { PROJECT_COLORS } from '@/types';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function ProjectSelector({ value, onChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' })
      .then((response) => response.json())
      .then(setProjects);
  }, []);

  async function handleCreate() {
    if (!newName.trim()) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Не удалось создать проект');
      }

      setProjects((current) => [...current, payload]);
      onChange(payload.id);
      setCreating(false);
      setNewName('');
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Не удалось создать проект');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-full px-3 py-2 text-sm font-medium transition ${
            !value
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
          }`}
        >
          Без проекта
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onChange(project.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
              value === project.id
                ? 'border-transparent text-white'
                : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]'
            }`}
            style={value === project.id ? { backgroundColor: project.color } : {}}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full border border-dashed border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Новый проект
        </button>
      </div>

      {creating && (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-card)]">
          <div className="space-y-3">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleCreate();
                }
                if (event.key === 'Escape') {
                  setCreating(false);
                }
              }}
              placeholder="Название проекта"
              className="w-full rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />

            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className="h-8 w-8 rounded-full transition"
                  style={{
                    backgroundColor: color,
                    boxShadow: newColor === color ? `0 0 0 3px ${color}44` : 'none',
                  }}
                />
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => { void handleCreate(); }}
                disabled={submitting}
                className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ backgroundColor: newColor }}
              >
                {submitting ? 'Создаю…' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
