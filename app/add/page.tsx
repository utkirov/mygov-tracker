'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PdfUpload } from '@/components/PdfUpload';
import { ProjectSelector } from '@/components/ProjectSelector';
import { requestImmediateSyncRun } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';
import type { ParsedPdf } from '@/types';

export default function AddPage() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedPdf | null>(null);
  const [filename, setFilename] = useState('');
  const [pdfStorageKey, setPdfStorageKey] = useState('');
  const [objectName, setObjectName] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const pdfStorageKeyRef = useRef('');
  const createdApplicationRef = useRef(false);

  useEffect(() => {
    pdfStorageKeyRef.current = pdfStorageKey;
  }, [pdfStorageKey]);

  async function cleanupTempPdf(pdfKey: string) {
    if (!pdfKey) {
      return;
    }

    try {
      await fetch('/api/applications/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfStorageKey: pdfKey }),
      });
    } catch {
      // Ignore cleanup errors, the temp file can be removed later manually if needed.
    }
  }

  function beaconCleanupTempPdf(pdfKey: string) {
    if (!pdfKey || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return;
    }

    const payload = new Blob([JSON.stringify({ pdfStorageKey: pdfKey })], {
      type: 'application/json',
    });

    navigator.sendBeacon('/api/applications/parse-pdf', payload);
  }

  useEffect(() => {
    const handlePageHide = () => {
      const currentPdfStorageKey = pdfStorageKeyRef.current;
      if (createdApplicationRef.current || !currentPdfStorageKey) {
        return;
      }

      beaconCleanupTempPdf(currentPdfStorageKey);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);

      const currentPdfStorageKey = pdfStorageKeyRef.current;
      if (!createdApplicationRef.current && currentPdfStorageKey) {
        beaconCleanupTempPdf(currentPdfStorageKey);
      }
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
    const currentPdfStorageKey = pdfStorageKeyRef.current;
    if (!createdApplicationRef.current && currentPdfStorageKey) {
      await cleanupTempPdf(currentPdfStorageKey);
    }

    setParsed(null);
    setFilename('');
    setPdfStorageKey('');
    setObjectName('');
    setNotes('');
    setProjectId(null);
    setError('');
    setStatus('');
  }

  async function handleSave() {
    if (!parsed || !pdfStorageKey) {
      setError('Сначала загрузите PDF заявления');
      return;
    }

    setSaving(true);
    setError('');
    setStatus('Сохраняю заявление…');

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          object_name: objectName.trim(),
          notes: notes.trim(),
          pdf_filename: filename,
          pdf_storage_key: pdfStorageKey,
          project_id: projectId,
        }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;

      if (!response.ok || !payload?.id) {
        throw new Error(payload?.error ?? 'Не удалось сохранить заявление');
      }

      createdApplicationRef.current = true;
      setStatus('Заявление сохранено. Фоновая проверка запускается отдельно.');

      void fetch(`/api/applications/${payload.id}/check`, { method: 'POST' }).catch(() => {
        showToast({
          title: 'Заявление сохранено',
          description: 'Первичная проверка не стартовала сразу. Очередь подхватит её автоматически.',
          tone: 'warning',
        });
      });

      requestImmediateSyncRun();
      showToast({
        title: 'Заявление добавлено',
        description: 'Запись появилась в общем мониторинге.',
        tone: 'success',
      });
      router.push('/dashboard');
    } catch (saveError) {
      setStatus('');
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Не удалось сохранить заявление'
      );
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { label: 'Номер заявления', key: 'application_number' },
    { label: 'Услуга', key: 'service_name' },
    { label: 'Организация', key: 'organization' },
    { label: 'Статус из PDF', key: 'status' },
    { label: 'Дата подачи', key: 'submission_date' },
    { label: 'Текущее действие', key: 'current_action' },
    { label: 'Пароль проверки', key: 'verification_password' },
  ] as const;

  return (
    <div className="px-4 py-5 md:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
          <button
            onClick={() => router.back()}
            className="rounded-full bg-[var(--panel-strong)] px-3 py-1.5 text-sm text-[var(--text-soft)] transition hover:text-[var(--text)]"
          >
            Назад
          </button>

          <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            New intake
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
            Добавить заявление в общий мониторинг
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-soft)] md:text-base">
            Сначала разбираем исходный PDF, затем дополняем его внутренним контекстом и
            сохраняем запись в общую очередь фоновых проверок.
          </p>
        </section>

        {!parsed ? (
          <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
            <PdfUpload onParsed={handleParsed} />
          </section>
        ) : (
          <>
            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                    Извлечено из PDF
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    Базовые данные уже готовы
                  </h2>
                </div>
                <button
                  onClick={() => {
                    void resetUnsavedUpload();
                  }}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]"
                >
                  Заменить PDF
                </button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.key} className="rounded-[24px] bg-[var(--panel-strong)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      {field.label}
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-[var(--text)]">
                      {parsed[field.key] || '—'}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
              <div className="grid gap-5">
                <label className="block">
                  <span className="text-sm font-medium text-[var(--text)]">Название объекта</span>
                  <input
                    value={objectName}
                    onChange={(event) => setObjectName(event.target.value)}
                    placeholder="Например, жилой дом, участок, помещение"
                    className="mt-2 w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <div>
                  <span className="text-sm font-medium text-[var(--text)]">Проект</span>
                  <div className="mt-2">
                    <ProjectSelector value={projectId} onChange={setProjectId} />
                  </div>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-[var(--text)]">Внутренняя заметка</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Контекст, договорённости, важные детали по кейсу"
                    className="mt-2 min-h-[140px] w-full rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-sm leading-6 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>

              {(error || status) && (
                <div
                  className={`mt-5 rounded-[24px] px-4 py-3 text-sm ${
                    error
                      ? 'border border-red-300/40 bg-red-50 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100'
                      : 'border border-emerald-300/40 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100'
                  }`}
                >
                  {error || status}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => {
                    void resetUnsavedUpload();
                  }}
                  className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]"
                >
                  Начать заново
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {saving ? 'Сохраняю…' : 'Сохранить и поставить в очередь'}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
