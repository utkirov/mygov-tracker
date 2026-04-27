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

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects);
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const p = await res.json();
    setProjects(prev => [...prev, p]);
    onChange(p.id);
    setCreating(false);
    setNewName('');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-3 py-1.5 rounded-full text-sm border transition
            ${!value ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text2)]'}`}
        >
          Без проекта
        </button>
        {projects.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition
              ${value === p.id ? 'border-transparent text-white' : 'border-[var(--border)] text-[var(--text)]'}`}
            style={value === p.id ? { background: p.color } : {}}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-full text-sm border border-dashed border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
        >
          + Новый проект
        </button>
      </div>

      {creating && (
        <div className="card p-3 flex flex-col gap-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Название проекта"
            className="w-full bg-[var(--surface2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-[var(--accent)]"
          />
          <div className="flex gap-1.5">
            {PROJECT_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className="w-6 h-6 rounded-full transition"
                style={{ background: c, outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCreating(false)}
              className="flex-1 py-1.5 text-sm rounded-lg bg-[var(--surface2)] text-[var(--text2)]">Отмена</button>
            <button type="button" onClick={handleCreate}
              className="flex-1 py-1.5 text-sm rounded-lg text-white font-medium"
              style={{ background: newColor }}>Создать</button>
          </div>
        </div>
      )}
    </div>
  );
}
