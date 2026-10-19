'use client';

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';

import { ApplicationCard } from '@/components/ApplicationCard';
import type { Application } from '@/types';

export default function ArchivePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [search,       setSearch]       = useState('');
  const [dataLoaded,   setDataLoaded]   = useState(false);
  const [loadError,    setLoadError]    = useState(false);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/applications?archived=true', { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить архив');
      const apps = await response.json() as Application[];
      startTransition(() => {
        setApplications(apps);
        setDataLoaded(true);
        setLoadError(false);
      });
    } catch {
      startTransition(() => {
        setLoadError(true);
        setDataLoaded(true);
      });
    }
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
    <div className="flex h-[calc(100svh-56px)] flex-col overflow-hidden">
      {/* ── Header ── */}
      <div
        className="border-b px-4 py-3 md:px-6 md:py-4 animate-slide-down"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
              Архив
            </h1>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular font-semibold" style={{ color: 'var(--text-soft)' }}>{applications.length}</span> завершённых и отложенных
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-[7px] px-2.5 py-1 text-[12px] font-semibold tabular"
              style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}
            >
              {applications.length}
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="w-36 rounded-[10px] px-3 py-2 text-[13px] outline-none transition focus:ring-2 md:w-52"
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
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {!dataLoaded ? (
          <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-[12px] border p-4"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="mb-2.5 h-3 w-24 rounded animate-shimmer" />
                <div className="h-4 w-full rounded animate-shimmer" />
                <div className="mt-2 h-3.5 w-3/4 rounded animate-shimmer" />
                <div className="mt-3 h-3 w-1/2 rounded animate-shimmer" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[12px] text-2xl"
              style={{ background: 'var(--danger-soft)' }}>
              ⚠️
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Не удалось загрузить архив.
            </p>
            <button
              onClick={() => void loadData()}
              className="rounded-[9px] px-4 py-2 text-[12px] font-semibold text-white transition active:scale-95"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              Повторить
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[12px] text-2xl"
              style={{ background: 'var(--panel)' }}>
              📦
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {search ? 'Ничего не найдено.' : 'Архив пуст.'}
            </p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((application, idx) => (
              <div key={application.id} className="animate-slide-up" style={{ animationDelay: `${idx * 40}ms` }}>
                <ApplicationCard application={application} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
