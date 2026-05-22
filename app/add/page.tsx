'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PdfUpload } from '@/components/PdfUpload';
import { ProjectSelector } from '@/components/ProjectSelector';
import { requestImmediateSyncRun } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';
import type { ParsedPdf } from '@/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] border p-4 md:p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AddPage() {
  const router = useRouter();
  const [parsed,         setParsed]         = useState<ParsedPdf | null>(null);
  const [filename,       setFilename]       = useState('');
  const [pdfStorageKey,  setPdfStorageKey]  = useState('');
  const [objectName,     setObjectName]     = useState('');
  const [notes,          setNotes]          = useState('');
  const [projectId,      setProjectId]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [status,         setStatus]         = useState('');
  const [error,          setError]          = useState('');
  const [confirmReset,   setConfirmReset]   = useState(false);
  const pdfStorageKeyRef      = useRef('');
  const createdApplicationRef = useRef(false);

  useEffect(() => {
    pdfStorageKeyRef.current = pdfStorageKey;
  }, [pdfStorageKey]);

  async function cleanupTempPdf(pdfKey: string) {
    if (!pdfKey) return;
    try {
      await fetch('/api/applications/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfStorageKey: pdfKey }),
      });
    } catch { /* ignore */ }
  }

  function beaconCleanupTempPdf(pdfKey: string) {
    if (!pdfKey || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    const payload = new Blob([JSON.stringify({ pdfStorageKey: pdfKey })], { type: 'application/json' });
    navigator.sendBeacon('/api/applications/parse-pdf', payload);
  }

  useEffect(() => {
    const handlePageHide = () => {
      const key = pdfStorageKeyRef.current;
      if (createdApplicationRef.current || !key) return;
      beaconCleanupTempPdf(key);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      const key = pdfStorageKeyRef.current;
      if (!createdApplicationRef.current && key) beaconCleanupTempPdf(key);
    };
  }, []);

  function handleParsed(fields: ParsedPdf, nextFilename: string, storageKey: string) {
    if (!createdApplicationRef.current && pdfStorageKey && pdfStorageKey !== storageKey) {
      void cleanupTempPdf(pdfStorageKey);
    }
    setParsed(fields);
    setFilename(nextFilename);
    setPdfStorageKey(storageKey);
    setError('');
    setStatus('');
  }

  async function resetUnsavedUpload() {
    const key = pdfStorageKeyRef.current;
    if (!createdApplicationRef.current && key) await cleanupTempPdf(key);
    setParsed(null); setFilename(''); setPdfStorageKey('');
    setObjectName(''); setNotes(''); setProjectId(null);
    setError(''); setStatus('');
  }

  async function handleSave() {
    if (!parsed || !pdfStorageKey) { setError('Сначала загрузите PDF заявления'); return; }
    setSaving(true); setError(''); setStatus('Сохраняю заявление…');
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          object_name:      objectName.trim(),
          notes:            notes.trim(),
          pdf_filename:     filename,
          pdf_storage_key:  pdfStorageKey,
          project_id:       projectId,
        }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) throw new Error(payload?.error ?? 'Не удалось сохранить заявление');
      createdApplicationRef.current = true;
      setStatus('Заявление сохранено. Фоновая проверка запускается отдельно.');
      void fetch(`/api/applications/${payload.id}/check`, { method: 'POST' }).catch(() => {
        showToast({ title: 'Заявление сохранено', description: 'Первичная проверка не стартовала сразу.', tone: 'warning' });
      });
      requestImmediateSyncRun();
      showToast({ title: 'Заявление добавлено', description: 'Запись появилась в общем мониторинге.', tone: 'success' });
      router.push('/dashboard');
    } catch (saveError) {
      setStatus('');
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить заявление');
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { label: 'Номер заявления',   key: 'application_number' },
    { label: 'Услуга',            key: 'service_name' },
    { label: 'Организация',       key: 'organization' },
    { label: 'Статус из PDF',     key: 'status' },
    { label: 'Дата подачи',       key: 'submission_date' },
    { label: 'Текущее действие',  key: 'current_action' },
    { label: 'Пароль проверки',   key: 'verification_password' },
  ] as const;

  const inputCls = "w-full rounded-[9px] border px-3 py-2.5 text-[13px] outline-none transition focus:border-[var(--accent)]";
  const inputSty = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };

  return (
    <div className="overflow-y-auto px-3 py-4 md:px-5 md:py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">

        {/* ── Header ── */}
        <Section>
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition hover:bg-[var(--panel)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Новое заявление
              </p>
              <h1 className="mt-1 text-[18px] font-bold leading-[1.3] md:text-xl" style={{ color: 'var(--text)' }}>
                Добавить в мониторинг
              </h1>
              <p className="mt-1.5 text-[12px] leading-[1.6]" style={{ color: 'var(--text-soft)' }}>
                Загрузите PDF заявления — данные извлекутся автоматически.
              </p>
            </div>
          </div>
        </Section>

        {/* ── PDF upload or parsed data ── */}
        {!parsed ? (
          <Section>
            <PdfUpload onParsed={handleParsed} />
          </Section>
        ) : (
          <>
            {/* Extracted fields */}
            <Section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Извлечено из PDF
                  </p>
                  <h2 className="mt-1 text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                    Базовые данные готовы
                  </h2>
                </div>
                <button
                  onClick={() => { void resetUnsavedUpload(); }}
                  className="rounded-[9px] border px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--border-strong)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                >
                  Заменить PDF
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {fields.map(field => (
                  <div key={field.key} className="rounded-[9px] p-3" style={{ background: 'var(--panel)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {field.label}
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium leading-[1.4]" style={{ color: 'var(--text)' }}>
                      {parsed[field.key] || '—'}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Extra fields */}
            <Section>
              <div className="space-y-4">
                <h2 className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Дополнить запись</h2>

                <label className="block">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>Название объекта</span>
                  <input
                    value={objectName}
                    onChange={e => setObjectName(e.target.value)}
                    placeholder="Напр.: жилой дом, участок, помещение"
                    className={`mt-1.5 ${inputCls}`}
                    style={inputSty}
                  />
                </label>

                <div>
                  <span className="text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>Проект</span>
                  <div className="mt-1.5">
                    <ProjectSelector value={projectId} onChange={setProjectId} />
                  </div>
                </div>

                <label className="block">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>Внутренняя заметка</span>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Контекст, договорённости, важные детали…"
                    className={`mt-1.5 min-h-[120px] resize-none ${inputCls}`}
                    style={inputSty}
                  />
                </label>
              </div>

              {(error || status) && (
                <div
                  className={`mt-4 rounded-[9px] px-3.5 py-2.5 text-[12px] font-medium ${
                    error
                      ? 'border border-red-400/20 bg-red-400/10 text-red-400'
                      : 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
                  }`}
                >
                  {error || status}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                {confirmReset ? (
                  <div className="flex flex-1 items-center gap-2 rounded-[10px] border px-3 py-2"
                    style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
                    <span className="flex-1 text-[12px] font-medium" style={{ color: 'var(--warning)' }}>
                      Данные будут сброшены. Продолжить?
                    </span>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/10"
                      style={{ color: 'var(--text-soft)' }}
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => { setConfirmReset(false); void resetUnsavedUpload(); }}
                      className="rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition"
                      style={{ background: 'var(--warning)', color: '#fff' }}
                    >
                      Сбросить
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="flex-1 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition hover:border-[var(--border-strong)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                  >
                    Начать заново
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {saving ? 'Сохраняю…' : 'Сохранить и поставить в очередь'}
                </button>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
