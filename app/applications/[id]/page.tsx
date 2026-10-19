'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, GitBranch } from 'lucide-react';

import { syncEngineEvents, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { formatDate, getChangeHeadline } from '@/lib/format-utils';
import { showToast } from '@/lib/toast';
import type { Application, StatusHistory as TStatusHistory } from '@/types';
import {
  getApplicationChangeFieldLabel,
  getMyGovStatus,
  isApplicationCheckable,
} from '@/types';

const HistorySection = dynamic(
  () => import('@/components/detail/HistorySection'),
  {
    loading: () => (
      <div className="rounded-[16px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="h-5 w-36 rounded-lg animate-shimmer" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[10px] animate-shimmer" />)}
        </div>
      </div>
    ),
    ssr: false,
  }
);

const NotesSection = dynamic(
  () => import('@/components/detail/NotesSection'),
  {
    loading: () => (
      <div className="rounded-[16px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="h-5 w-36 rounded-lg animate-shimmer" />
        <div className="mt-4 h-28 rounded-[10px] animate-shimmer" />
      </div>
    ),
    ssr: false,
  }
);

const PdfSection = dynamic(
  () => import('@/components/detail/PdfSection'),
  {
    loading: () => (
      <div className="rounded-[16px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="h-5 w-36 rounded-lg animate-shimmer" />
        <div className="mt-4 h-16 rounded-[10px] animate-shimmer" />
      </div>
    ),
    ssr: false,
  }
);

const OperationalDataSection = dynamic(
  () => import('@/components/detail/OperationalDataSection'),
  {
    loading: () => (
      <div className="rounded-[16px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="h-5 w-36 rounded-lg animate-shimmer" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-[10px] animate-shimmer" />)}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sync = useSyncEngineSnapshot();
  const [application, setApplication] = useState<Application | null>(null);
  const [history, setHistory] = useState<TStatusHistory[]>([]);
  const [notes, setNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [togglingArchive, setTogglingArchive] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [chain, setChain] = useState<Application[]>([]);
  const [loadError, setLoadError] = useState(false);

  const loadApplication = useCallback(async () => {
    try {
      const response = await fetch(`/api/applications/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить заявление');
      const payload = await response.json() as { application: Application; history: TStatusHistory[] };
      startTransition(() => {
        setApplication(payload.application);
        setHistory(payload.history);
        setNotes(payload.application.notes);
        setLoadError(false);
      });
    } catch {
      startTransition(() => {
        setLoadError(true);
      });
    }
  }, [id]);

  useEffect(() => {
    void loadApplication();
    window.addEventListener(syncEngineEvents.applications, loadApplication);
    return () => window.removeEventListener(syncEngineEvents.applications, loadApplication);
  }, [loadApplication]);

  useEffect(() => {
    fetch(`/api/applications/${id}/chain`)
      .then(r => r.json())
      .then((data: Application[]) => setChain(data))
      .catch(() => {});
  }, [id]);

  async function handleCheck() {
    setChecking(true);
    try {
      const response = await fetch(`/api/applications/${id}/check?manual=true`, { method: 'POST' });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось выполнить проверку');
      }
      // Only this application was checked — refresh it (and the list views),
      // don't kick off a full cycle over every application.
      window.dispatchEvent(new CustomEvent(syncEngineEvents.applications));
      await loadApplication();
    } catch (error) {
      showToast({ title: 'Проверка не выполнена', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveNotes() {
    if (!application) return;
    setSavingNotes(true);
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось сохранить заметки');
      }
      await loadApplication();
    } catch (error) {
      showToast({ title: 'Заметки не сохранены', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleToggleArchive() {
    if (!application) return;
    setTogglingArchive(true);
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !application.archived }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось изменить статус архива');
      }
      router.push(application.archived ? '/dashboard' : '/archive');
    } catch (error) {
      showToast({ title: 'Не удалось сохранить', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setTogglingArchive(false);
    }
  }

  async function handlePdfReupload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/applications/${id}/pdf`, { method: 'POST', body: formData });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Не удалось загрузить PDF');
      }
      await loadApplication();
    } catch (error) {
      showToast({ title: 'Загрузка PDF не удалась', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setPdfUploading(false);
      event.target.value = '';
    }
  }

  const timelineItems = useMemo(() => {
    return history.map((entry, index) => {
      const matchesCurrentStatus = application ? entry.status === application.status : false;
      const matchesCurrentAction = application ? entry.current_action === application.current_action : false;
      const isCurrentSnapshot = index === 0 || (matchesCurrentStatus && matchesCurrentAction);
      return { ...entry, isCurrentSnapshot };
    });
  }, [application, history]);

  if (!application) {
    if (loadError) {
      return (
        <div className="flex h-[calc(100svh-60px)] flex-col items-center justify-center gap-3 text-[13px]"
          style={{ color: 'var(--text-muted)' }}>
          <p>Не удалось загрузить заявление.</p>
          <button
            onClick={() => void loadApplication()}
            className="rounded-[9px] px-4 py-2 text-[12px] font-semibold text-white transition active:scale-95"
            style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)' }}
          >
            Повторить
          </button>
        </div>
      );
    }
    return (
      <div className="flex h-[calc(100svh-60px)] items-center justify-center text-[13px]"
        style={{ color: 'var(--text-muted)' }}>
        Загрузка заявления…
      </div>
    );
  }

  const checkable = isApplicationCheckable(application);
  const statusInfo = getMyGovStatus(application.status);

  return (
    <div className="overflow-y-auto px-4 py-4 md:px-6 md:py-6 animate-fade-up">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:gap-5">

        {/* Header card */}
        <div className="rounded-[16px] border p-4 md:p-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition active:scale-95 hover:bg-[var(--panel-strong)]"
              style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={13} />
              Назад
            </button>
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
              № {application.application_number}
            </span>
            {application.archived && (
              <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
                В архиве
              </span>
            )}
          </div>

          <h1 className="text-[20px] font-extrabold leading-[1.25] tracking-[-0.02em] md:text-[24px]" style={{ color: 'var(--text)' }}>
            {application.object_name || application.service_name}
          </h1>
          {application.object_name && (
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              {application.service_name}
            </p>
          )}
          {application.organization && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              <span>🏛</span> {application.organization}
            </p>
          )}

          {/* Stat row — 2 cols on mobile, 4 on desktop */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:mt-5 md:grid-cols-4">
            <div className="rounded-[12px] p-3.5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
              <p className="label-caps">Статус</p>
              <div className="mt-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-bold"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                  {statusInfo.label}
                </span>
              </div>
            </div>
            <div className="rounded-[12px] p-3.5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
              <p className="label-caps">Действует</p>
              <p className="mt-2.5 text-[13px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                {application.acting_party || '—'}
              </p>
            </div>
            <div className="rounded-[12px] p-3.5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
              <p className="label-caps">Последнее изм.</p>
              <p className="mt-2.5 font-mono text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                {formatDate(application.last_changed_date)}
              </p>
            </div>
            <div className="rounded-[12px] p-3.5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
              <p className="label-caps">Проверка</p>
              <p className="mt-2.5 font-mono text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                {formatDate(application.last_checked_at)}
              </p>
            </div>
          </div>

          {/* Error banner */}
          {application.last_error && (
            <div
              className="mt-3 rounded-[10px] p-3"
              style={{ background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)' }}
            >
              <div className="flex items-start gap-2">
                <span className="mt-[1px] shrink-0 text-[13px]">⚠️</span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: 'var(--danger)' }}>
                    Ошибка последней проверки
                  </p>
                  <p className="mt-0.5 text-[12px] leading-[1.5]" style={{ color: 'var(--text-soft)' }}>
                    {application.last_error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions — scrollable row on mobile */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none md:mt-5 md:flex-wrap md:overflow-visible md:pb-0">
            {checkable ? (
              <button
                onClick={handleCheck}
                disabled={checking}
                className="shrink-0 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white transition active:scale-95 disabled:opacity-60 md:hover:brightness-105"
                style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)', boxShadow: '0 2px 10px rgba(59,110,250,0.35)' }}
              >
                {checking ? 'Проверяю…' : 'Проверить'}
              </button>
            ) : (
              <div className="shrink-0 rounded-[10px] px-4 py-2.5 text-[13px]"
                style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
                Не проверяется
              </div>
            )}
            <a
              href={`/api/applications/${id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition active:scale-95"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              Оригинал
            </a>
            <a
              href={`/api/applications/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition active:scale-95"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              PDF
            </a>
            {confirmArchive && !application.archived ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Архивировать?</span>
                <button
                  onClick={() => { setConfirmArchive(false); void handleToggleArchive(); }}
                  disabled={togglingArchive}
                  className="rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold transition active:scale-95 disabled:opacity-60"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  Да
                </button>
                <button
                  onClick={() => setConfirmArchive(false)}
                  className="rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium transition active:scale-95"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                >
                  Нет
                </button>
              </div>
            ) : (
              <button
                onClick={() => application.archived ? void handleToggleArchive() : setConfirmArchive(true)}
                disabled={togglingArchive}
                className="shrink-0 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition active:scale-95 disabled:opacity-60"
                style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
              >
                {togglingArchive ? 'Сохраняю…' : application.archived ? 'В активные' : 'В архив'}
              </button>
            )}
            <button
              onClick={() => router.push(`/applications/${id}/edit`)}
              className="shrink-0 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition active:scale-95"
              style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
            >
              Изменить
            </button>
            {application.archived && (
              <Link
                href={`/add?parent_id=${id}`}
                className="shrink-0 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white transition active:scale-95 hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #3B6EFA 0%, #7C3AED 100%)', boxShadow: '0 2px 10px rgba(59,110,250,0.3)' }}
              >
                Продолжить заявку
              </Link>
            )}
          </div>
        </div>

        {/* Chain section */}
        {chain.length > 1 && (
          <div className="rounded-[16px] border p-4 md:p-5"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={14} style={{ color: 'var(--accent)' }} />
              <p className="label-caps">Цепочка заявок</p>
              <span className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {chain.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {chain.map((item, i) => {
                const isCurrent = item.id === id;
                const sInfo = getMyGovStatus(item.status);
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    {/* connector */}
                    <div className="flex flex-col items-center" style={{ width: 20, paddingTop: 3 }}>
                      <div className={`h-3 w-3 rounded-full border-2 shrink-0 ${isCurrent ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]'}`}
                        style={{ background: isCurrent ? 'var(--accent)' : 'var(--panel)' }} />
                      {i < chain.length - 1 && (
                        <div className="mt-1 w-px flex-1 min-h-[16px]" style={{ background: 'var(--border)' }} />
                      )}
                    </div>
                    {isCurrent ? (
                      <div className="flex-1 rounded-[10px] p-3 mb-1.5"
                        style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12px] font-bold" style={{ color: 'var(--accent)' }}>
                            Текущая — № {item.application_number}
                          </p>
                          <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>{sInfo.label}</span>
                        </div>
                        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                          {item.object_name || item.service_name}
                        </p>
                      </div>
                    ) : (
                      <Link href={`/applications/${item.id}`} className="flex-1 rounded-[10px] p-3 mb-1.5 transition hover:bg-[var(--panel-strong)]"
                        style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                            № {item.application_number}
                          </p>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sInfo.label}</span>
                        </div>
                        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          {item.object_name || item.service_name}
                        </p>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <div className="space-y-4">
            {/* Last change */}
            <div className="rounded-[16px] border p-4 md:p-5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label-caps">Последнее изменение</p>
                  <h2 className="mt-1.5 text-[15px] font-extrabold leading-[1.3] tracking-[-0.01em] md:text-[17px]"
                    style={{ color: 'var(--text)' }}>
                    {application.last_change_summary.length > 0
                      ? getChangeHeadline(application)
                      : 'Изменения пока не зафиксированы'}
                  </h2>
                </div>
                {application.last_change_fields.length > 0 && (
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {application.last_change_fields.map(field => (
                      <span key={field} className="rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em]"
                        style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                        {getApplicationChangeFieldLabel(field)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-[10px] p-3.5 md:p-4"
                style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="label-caps">Дата изменения</p>
                    <p className="mt-1.5 font-mono text-[18px] font-bold tracking-[-0.01em] md:text-[22px]" style={{ color: 'var(--text)' }}>
                      {formatDate(application.last_changed_date)}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
                      {application.last_change_summary[0] || 'Изменений с последней проверки не зафиксировано.'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <p className="label-caps">Обнаружено системой</p>
                    <p className="mt-1.5 font-mono text-[12px] font-semibold" style={{ color: 'var(--text-soft)' }}>
                      {formatDate(application.last_detected_change_at)}
                    </p>
                  </div>
                </div>
              </div>

              {application.last_change_summary.length === 0 ? (
                <p className="mt-3 text-[12px] leading-[1.6]" style={{ color: 'var(--text-muted)' }}>
                  После следующего реального изменения здесь появится разница по полям: статус, текущее действие, действующая сторона и дата.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {application.last_change_summary.map(line => (
                    <div key={line} className="rounded-[10px] border-l-2 px-3 py-2.5 text-[12px] leading-[1.5]"
                      style={{ borderLeftColor: 'var(--accent)', background: 'var(--panel)', color: 'var(--text-soft)' }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <HistorySection timelineItems={timelineItems} />
          </div>

          <div className="space-y-4">
            <OperationalDataSection
              application={application}
              sync={sync}
              checkable={checkable}
            />
            <NotesSection
              notes={notes}
              savingNotes={savingNotes}
              onNotesChange={setNotes}
              onBlur={handleSaveNotes}
            />
            <PdfSection
              applicationId={id}
              pdfFilename={application.pdf_filename}
              pdfUploading={pdfUploading}
              onPdfReupload={handlePdfReupload}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
