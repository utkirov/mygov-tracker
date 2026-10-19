'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronRight, X } from 'lucide-react';

import { PdfUpload } from '@/components/PdfUpload';
import { requestImmediateSyncRun } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';
import type { Application, ParsedPdf, Project } from '@/types';

type Step = 1 | 2 | 3;

// The fields a my.gov.uz application PDF normally contains — "Распознано N полей из 8".
const RECOGNISED_KEYS = [
  'application_number', 'verification_password', 'service_name', 'organization',
  'status', 'submission_date', 'current_action', 'sms_phone',
] as const satisfies ReadonlyArray<keyof ParsedPdf>;

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Steps({ step }: { step: Step }) {
  const items = ['Загрузка PDF', 'Проверка данных', 'Первая проверка статуса'];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {items.map((label, i) => {
        const n = (i + 1) as Step;
        const reached = n <= step;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
            <span className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12px] font-medium"
              style={{ background: reached ? 'var(--accent-soft)' : 'var(--panel)', color: reached ? 'var(--accent)' : 'var(--text-muted)' }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold"
                style={reached ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--panel-strong)', color: 'var(--text-muted)' }}>
                {n < step ? <Check size={11} /> : n}
              </span>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AddPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialParent  = searchParams.get('parent_id');
  const initialProject = searchParams.get('project_id');

  const [parsed,        setParsed]        = useState<ParsedPdf | null>(null);
  const [filename,      setFilename]      = useState('');
  const [pdfStorageKey, setPdfStorageKey] = useState('');
  const [objectName,    setObjectName]    = useState('');
  const [notes,         setNotes]         = useState('');
  const [projectId,     setProjectId]     = useState(initialProject ?? '');
  const [parentId,      setParentId]      = useState(initialParent ?? '');
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [candidates,    setCandidates]    = useState<Application[]>([]);
  const [step,          setStep]          = useState<Step>(1);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  const pdfStorageKeyRef      = useRef('');
  const createdApplicationRef = useRef(false);

  useEffect(() => { pdfStorageKeyRef.current = pdfStorageKey; }, [pdfStorageKey]);

  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' }).then(r => r.json())
      .then((list: Project[]) => setProjects(Array.isArray(list) ? list : [])).catch(() => {});
    Promise.all([
      fetch('/api/applications', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
      fetch('/api/applications?archived=true', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    ]).then(([active, archived]: [Application[], Application[]]) => {
      setCandidates([...(Array.isArray(active) ? active : []), ...(Array.isArray(archived) ? archived : [])]);
    });
  }, []);

  // Continuing a chain: prefill object, notes and project from the parent.
  useEffect(() => {
    if (!initialParent) return;
    fetch(`/api/applications/${initialParent}`)
      .then(r => r.json())
      .then(({ application }: { application: Application }) => {
        setObjectName(application.object_name ?? '');
        setNotes(application.notes ?? '');
        if (application.project_id) setProjectId(application.project_id);
      })
      .catch(() => {});
  }, [initialParent]);

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
    setStep(2);
  }

  async function removePdf() {
    const key = pdfStorageKeyRef.current;
    if (!createdApplicationRef.current && key) await cleanupTempPdf(key);
    setParsed(null); setFilename(''); setPdfStorageKey('');
    setError(''); setStep(1);
  }

  function setField(key: keyof ParsedPdf, value: string) {
    setParsed(prev => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!parsed || !pdfStorageKey) { setError('Сначала загрузите PDF заявления'); return; }
    if (!parsed.application_number.trim() || !parsed.verification_password.trim()) {
      setError('Нужны номер заявления и пароль проверки — без них my.gov.uz не отдаст статус');
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          object_name:     objectName.trim(),
          notes:           notes.trim(),
          pdf_filename:    filename,
          pdf_storage_key: pdfStorageKey,
          parent_id:       parentId || null,
          project_id:      projectId || null,
        }),
      });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) throw new Error(payload?.error ?? 'Не удалось сохранить заявление');
      createdApplicationRef.current = true;

      // Step 3: first status check right away, then open the application.
      setStep(3);
      const check = await fetch(`/api/applications/${payload.id}/check?manual=true`, { method: 'POST' }).catch(() => null);
      requestImmediateSyncRun();
      if (check?.ok) {
        showToast({ title: 'Заявление добавлено', description: 'Первая проверка статуса выполнена.', tone: 'success' });
      } else {
        showToast({ title: 'Заявление добавлено', description: 'Первая проверка не прошла — повторится автоматически.', tone: 'warning' });
      }
      router.push(`/applications/${payload.id}`);
    } catch (saveError) {
      setStep(2);
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить заявление');
    } finally {
      setSaving(false);
    }
  }

  const recognised = parsed ? RECOGNISED_KEYS.filter(k => parsed[k]?.trim()).length : 0;

  const inputCls = 'mt-1 block h-10 w-full rounded-[10px] border px-3 text-[13px] outline-none transition focus:border-[var(--accent)] disabled:opacity-60';
  const inputSty = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };
  const labelCls = 'block text-[12px]';
  const disabled = !parsed || saving;

  const field = (label: string, key: keyof ParsedPdf, placeholder = '') => (
    <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
      {label}
      <input value={parsed?.[key] ?? ''} onChange={e => setField(key, e.target.value)} placeholder={placeholder}
        disabled={disabled} className={inputCls} style={inputSty} />
    </label>
  );

  return (
    <div className="h-[calc(100svh-56px)] overflow-y-auto">
      <div className="mx-auto w-full max-w-[1040px] px-4 py-5 md:px-6 md:py-8">
        <h1 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          {initialParent ? 'Продолжение заявки' : 'Новое заявление'}
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Загрузите PDF из my.gov.uz — номер, пароль и данные заполнятся автоматически
        </p>
        <Steps step={step} />

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card title="PDF заявления">
            <PdfUpload onParsed={handleParsed} />
            {parsed && (
              <div className="mt-3 flex items-center gap-3 rounded-[10px] px-3 py-2.5" style={{ background: 'var(--success-soft, var(--panel))' }}>
                <Check size={16} style={{ color: 'var(--success)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{filename}</p>
                  <p className="text-[11px]" style={{ color: 'var(--success)' }}>
                    Распознано {recognised} {recognised === 1 ? 'поле' : recognised < 5 && recognised > 0 ? 'поля' : 'полей'} из {RECOGNISED_KEYS.length}
                  </p>
                </div>
                <button onClick={() => void removePdf()} disabled={saving} aria-label="Убрать PDF" style={{ color: 'var(--text-muted)' }}>
                  <X size={16} />
                </button>
              </div>
            )}
          </Card>

          <Card title="Данные заявления" aside={<span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>проверьте перед сохранением</span>}>
            {!parsed && (
              <p className="mb-4 rounded-[10px] px-3 py-2.5 text-[12px]" style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
                Поля заполнятся после загрузки PDF.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {field('Номер заявления', 'application_number')}
              {field('Пароль проверки', 'verification_password')}
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                Объект
                <input value={objectName} onChange={e => setObjectName(e.target.value)} disabled={disabled}
                  placeholder="Жилой дом, участок, помещение" className={inputCls} style={inputSty} />
              </label>
              {field('Услуга', 'service_name')}
              {field('Организация', 'organization')}
              {field('Статус', 'status')}
              {field('Дата подачи', 'submission_date')}
              {field('SMS-телефон', 'sms_phone')}
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                Проект
                <select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={disabled} className={inputCls} style={inputSty}>
                  <option value="">Без проекта</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className={labelCls} style={{ color: 'var(--text-muted)' }}>
                Родительское заявление (цепочка)
                <select value={parentId} onChange={e => setParentId(e.target.value)} disabled={disabled} className={inputCls} style={inputSty}>
                  <option value="">Не выбрано</option>
                  {candidates.map(a => (
                    <option key={a.id} value={a.id}>№ {a.application_number} · {a.object_name || a.service_name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className={`${labelCls} mt-3`} style={{ color: 'var(--text-muted)' }}>
              Заметки
              <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={disabled} placeholder="Необязательно"
                className="mt-1 block min-h-[64px] w-full resize-y rounded-[10px] border px-3 py-2.5 text-[13px] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                style={inputSty} />
            </label>

            {error && (
              <p className="mt-3 rounded-[10px] px-3 py-2.5 text-[12px] font-medium" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-4">
              <button onClick={() => router.back()} disabled={saving} className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>
                Отмена
              </button>
              <button onClick={() => void handleSave()} disabled={!parsed || saving}
                className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>
                <Check size={15} />
                {step === 3 ? 'Проверяю статус…' : saving ? 'Сохраняю…' : 'Добавить и проверить'}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense>
      <AddPageInner />
    </Suspense>
  );
}
