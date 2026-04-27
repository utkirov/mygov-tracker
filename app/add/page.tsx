'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedPdf } from '@/types';
import { PdfUpload } from '@/components/PdfUpload';
import { ProjectSelector } from '@/components/ProjectSelector';

export default function AddPage() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedPdf | null>(null);
  const [filename, setFilename] = useState('');
  const [objectName, setObjectName] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  function handleParsed(fields: ParsedPdf, name: string) {
    setParsed(fields);
    setFilename(name);
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setError('');

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed, object_name: objectName, notes, pdf_filename: filename, project_id: projectId }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg ?? 'Ошибка сохранения');
      setSaving(false);
      return;
    }

    const { id } = await res.json();
    setStatus('Проверяю статус на my.gov.uz...');
    await fetch(`/api/applications/${id}/check`, { method: 'POST' });
    router.push('/dashboard');
  }

  const fields = [
    { label: 'Номер заявки', key: 'application_number' },
    { label: 'Наименование услуги', key: 'service_name' },
    { label: 'Организация', key: 'organization' },
    { label: 'Состояние', key: 'status' },
    { label: 'Дата подачи', key: 'submission_date' },
    { label: 'Текущее действие', key: 'current_action' },
    { label: 'Пароль для проверки', key: 'verification_password' },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 md:py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-[var(--text2)] text-lg md:text-xl hover:text-[var(--text)]">←</button>
        <h1 className="font-bold text-lg md:text-xl text-[var(--text)]">Новая заявка</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-5">
        {!parsed ? (
          <PdfUpload onParsed={handleParsed} />
        ) : (
          <>
            <div className="card bg-[var(--surface2)] border border-[var(--border)] p-4 md:p-5">
              <p className="text-[var(--text)] font-semibold text-sm mb-4">✓ Данные извлечены из PDF</p>
              <div className="flex flex-col gap-2.5">
                {fields.map(f => (
                  <div key={f.key} className="flex justify-between gap-3 text-sm">
                    <span className="text-[var(--text2)] shrink-0">{f.label}</span>
                    <span className="text-[var(--text)] font-medium text-right break-words">{parsed[f.key] || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text)] block mb-2">Название объекта</label>
              <input
                value={objectName}
                onChange={e => setObjectName(e.target.value)}
                placeholder="Жилой дом по ул. Навои 12..."
                className="w-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text)] block mb-2">Проект</label>
              <ProjectSelector value={projectId} onChange={setProjectId} />
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text)] block mb-2">Заметка (необязательно)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Контекст, дополнительная информация..."
                className="w-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            {status && <p className="text-[var(--accent)] text-sm">{status}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setParsed(null); setFilename(''); }}
                className="flex-1 border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] rounded-lg py-3 text-sm font-medium hover:bg-[var(--surface2)] transition"
              >
                Загрузить другой PDF
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition"
              >
                {saving ? (status || 'Сохраняю...') : 'Сохранить заявку'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
