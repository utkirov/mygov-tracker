'use client';

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileText, Search } from 'lucide-react';

import { showToast } from '@/lib/toast';
import type { Application } from '@/types';
import { getMyGovStatus } from '@/types';

const PAGE_SIZE = 20;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type StatusFilter = 'all' | 'Обработано' | 'Отклонено' | 'Аннулировано' | 'other';
const OUTCOMES = ['Обработано', 'Отклонено', 'Аннулировано'] as const;

function outcomeOf(application: Application): StatusFilter {
  const label = getMyGovStatus(application.status).label;
  return (OUTCOMES as readonly string[]).includes(label) ? label as StatusFilter : 'other';
}

function finishedAt(application: Application): string {
  return application.last_changed_date ?? application.updated_at;
}

function formatDay(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toCsv(rows: Application[]): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const header = ['Номер', 'Объект', 'Услуга', 'Организация', 'Статус', 'Завершено', 'Документов'];
  const lines = rows.map(a => [
    a.application_number, a.object_name, a.service_name, a.organization,
    getMyGovStatus(a.status).label, formatDay(finishedAt(a)), String(a.result_documents ?? 0),
  ].map(v => escape(v ?? '')).join(';'));
  // BOM + ";" so Excel opens Cyrillic columns correctly.
  return '﻿' + [header.map(escape).join(';'), ...lines].join('\r\n');
}

function pageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) out.push('…');
    out.push(page);
  });
  return out;
}

export default function ArchivePage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState<StatusFilter>('all');
  const [last30,       setLast30]       = useState(false);
  const [page,         setPage]         = useState(1);
  const [dataLoaded,   setDataLoaded]   = useState(false);
  const [loadError,    setLoadError]    = useState(false);
  const [restoringId,  setRestoringId]  = useState<string | null>(null);

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

  const sorted = useMemo(
    () => [...applications].sort((a, b) => finishedAt(b).localeCompare(finishedAt(a))),
    [applications],
  );

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: sorted.length, 'Обработано': 0, 'Отклонено': 0, 'Аннулировано': 0, other: 0 };
    for (const a of sorted) result[outcomeOf(a)]++;
    return result;
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // eslint-disable-next-line react-hooks/purity -- "last 30 days" is relative to now by definition
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return sorted.filter(a => {
      if (status !== 'all' && outcomeOf(a) !== status) return false;
      if (last30 && new Date(finishedAt(a)).getTime() < cutoff) return false;
      if (!q) return true;
      return [a.application_number, a.object_name, a.service_name, a.organization]
        .join(' ').toLowerCase().includes(q);
    });
  }, [sorted, search, status, last30]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilter(next: () => void) {
    next();
    setPage(1);
  }

  async function handleRestore(application: Application) {
    setRestoringId(application.id);
    try {
      const response = await fetch(`/api/applications/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (!response.ok) throw new Error();
      setApplications(prev => prev.filter(a => a.id !== application.id));
      showToast({ title: `№ ${application.application_number} возвращено на доску`, tone: 'success' });
    } catch {
      showToast({ title: 'Не удалось вернуть заявление', tone: 'error' });
    } finally {
      setRestoringId(null);
    }
  }

  function handleExport() {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `archive-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const chips: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: `Все · ${counts.all}` },
    ...OUTCOMES.map(o => ({ id: o as StatusFilter, label: `${o} · ${counts[o]}` })),
    ...(counts.other > 0 ? [{ id: 'other' as StatusFilter, label: `Отложенные · ${counts.other}` }] : []),
  ];

  const chipStyle = (active: boolean) => active
    ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
    : { background: 'var(--surface)', color: 'var(--text-soft)', borderColor: 'var(--border)' };

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto w-full max-w-[1360px] px-4 py-5 md:px-10 md:py-8">
        {/* ── Header ── */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>Архив</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {applications.length} завершённых заявлений · проверка остановлена, документы сохранены
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-3 py-2.5 md:w-64 md:flex-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => changeFilter(() => setSearch(e.target.value))}
                placeholder="Поиск в архиве"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: 'var(--text)' }}
              />
            </label>
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="flex shrink-0 items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13px] font-semibold transition active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <Download size={15} />
              <span className="hidden sm:inline">Экспорт CSV</span>
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map(chip => (
            <button key={chip.id} type="button"
              onClick={() => changeFilter(() => setStatus(chip.id))}
              className="rounded-[7px] border px-2.5 py-1 text-[12px] font-medium transition"
              style={chipStyle(status === chip.id)}>
              {chip.label}
            </button>
          ))}
          <button type="button"
            onClick={() => changeFilter(() => setLast30(v => !v))}
            className="rounded-[7px] border px-2.5 py-1 text-[12px] font-medium transition"
            style={chipStyle(last30)}>
            За 30 дней
          </button>
        </div>

        {/* ── Table ── */}
        <div className="mt-4 overflow-hidden rounded-[14px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          {!dataLoaded ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-[8px] animate-shimmer" />)}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Не удалось загрузить архив.</p>
              <button onClick={() => void loadData()}
                className="rounded-[9px] px-4 py-2 text-[12px] font-semibold"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>
                Повторить
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {applications.length === 0 ? 'Архив пуст.' : 'Ничего не найдено.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b text-[12px]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                      <th className="px-5 py-3 font-medium">Номер</th>
                      <th className="px-3 py-3 font-medium">Объект и услуга</th>
                      <th className="px-3 py-3 font-medium">Организация</th>
                      <th className="px-3 py-3 font-medium">Статус</th>
                      <th className="px-3 py-3 font-medium">Завершено</th>
                      <th className="px-3 py-3 font-medium">Документы</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(a => {
                      const s = getMyGovStatus(a.status);
                      const docs = a.result_documents ?? 0;
                      return (
                        <tr key={a.id} className="border-b last:border-b-0 transition hover:bg-[var(--panel)]" style={{ borderColor: 'var(--border)' }}>
                          <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px]" style={{ color: 'var(--text-soft)' }}>
                            № {a.application_number}
                          </td>
                          <td className="px-3 py-3.5">
                            <Link href={`/applications/${a.id}`} className="block hover:underline">
                              <span className="font-semibold" style={{ color: 'var(--text)' }}>{a.object_name || a.service_name}</span>
                              {a.object_name && (
                                <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-muted)' }}>{a.service_name}</span>
                              )}
                            </Link>
                          </td>
                          <td className="px-3 py-3.5" style={{ color: 'var(--text-soft)' }}>{a.organization || '—'}</td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--text)' }}>
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dotColor }} />
                              {s.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[12px]" style={{ color: 'var(--text-soft)' }}>
                            {formatDay(finishedAt(a))}
                          </td>
                          <td className="px-3 py-3.5">
                            <Link href={`/applications/${a.id}`} className="inline-flex items-center gap-1.5 text-[12px]"
                              style={{ color: docs > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                              <FileText size={14} style={{ color: docs > 0 ? 'var(--danger)' : 'var(--text-muted)' }} />
                              {docs > 0 ? `${docs} PDF` : '—'}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right">
                            <button type="button"
                              onClick={() => void handleRestore(a)}
                              disabled={restoringId === a.id}
                              className="inline-flex items-center gap-1.5 text-[13px] font-medium disabled:opacity-50"
                              style={{ color: 'var(--accent)' }}>
                              <ArrowLeft size={14} />
                              {restoringId === a.id ? 'Возвращаю…' : 'Вернуть'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Показано {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} из {filtered.length}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    {pageNumbers(currentPage, totalPages).map((p, i) => p === '…' ? (
                      <span key={`gap-${i}`} className="px-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>…</span>
                    ) : (
                      <button key={p} type="button" onClick={() => setPage(p)}
                        className="h-8 min-w-8 rounded-[7px] px-2 text-[12px] font-medium transition"
                        style={p === currentPage
                          ? { background: 'var(--accent)', color: '#fff' }
                          : { background: 'var(--panel)', color: 'var(--text-soft)' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
