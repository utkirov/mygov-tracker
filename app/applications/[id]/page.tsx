'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Application, StatusHistory as TStatusHistory } from '@/types';
import { getStatusType } from '@/types';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusHistory } from '@/components/StatusHistory';

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [app, setApp] = useState<Application | null>(null);
  const [history, setHistory] = useState<TStatusHistory[]>([]);
  const [notes, setNotes] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);

  async function handlePdfReupload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/applications/${id}/pdf`, { method: 'POST', body: fd });
    if (res.ok) {
      setApp(prev => prev ? { ...prev, pdf_filename: file.name } : prev);
    }
    setPdfUploading(false);
    e.target.value = '';
  }

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(r => r.json())
      .then(({ application, history }) => {
        setApp(application);
        setHistory(history);
        setNotes(application.notes);
      });
  }, [id]);

  async function handleCheck() {
    setChecking(true);
    const res = await fetch(`/api/applications/${id}/check`, { method: 'POST' });
    if (res.ok) {
      const { application: updated, statusChanged } = await res.json();
      setApp(updated);
      if (statusChanged) {
        fetch(`/api/applications/${id}`)
          .then(r => r.json())
          .then(({ history }) => setHistory(history));
      }
    }
    setChecking(false);
  }

  async function handleSaveNotes() {
    setSaving(true);
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setSaving(false);
  }

  if (!app) return <div className="p-8 text-center text-[var(--text2)]">Загрузка...</div>;

  const fields = [
    { label: 'Наименование услуги', value: app.service_name },
    { label: 'Организация', value: app.organization },
    { label: 'Дата подачи', value: app.submission_date ? new Date(app.submission_date).toLocaleString('ru-RU') : '—' },
    { label: 'Последнее изменение', value: app.last_changed_date ? new Date(app.last_changed_date).toLocaleString('ru-RU') : '—' },
    { label: 'Пароль для проверки', value: app.verification_password },
    { label: 'SMS-телефон', value: app.sms_phone },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} className="text-[var(--text2)] text-lg md:text-xl hover:text-[var(--text)]">←</button>
          <h1 className="font-bold text-base md:text-lg font-mono text-[var(--text)] truncate">№ {app.application_number}</h1>
        </div>
        <button
          onClick={() => router.push(`/applications/${id}/edit`)}
          className="text-sm text-[var(--text2)] border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--surface2)] transition shrink-0"
        >
          Изменить
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-6 flex flex-col gap-5">
        <StatusBadge status={app.status} acting_party={app.acting_party} />

        {app.current_action && (
          <div className="card bg-[var(--surface2)] p-4 border border-[var(--border)]">
            <p className="text-sm text-[var(--text2)] mb-1">Текущее действие</p>
            <p className="text-[var(--text)] font-medium">{app.current_action}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:gap-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg font-medium transition"
          >
            {checking ? '...' : '↻ Проверить'}
          </button>
          <a
            href={`/api/applications/${id}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm px-4 py-2.5 rounded-lg hover:bg-[var(--surface2)] transition"
          >
            Оригинал ↗
          </a>
        </div>

        <div className="card bg-[var(--surface)] border border-[var(--border)] p-4 md:p-5 flex flex-col gap-4">
          {fields.map(f => (
            <div key={f.label}>
              <div className="text-xs text-[var(--text3)] uppercase tracking-wide mb-1">{f.label}</div>
              <div className="text-sm text-[var(--text)]">{f.value || '—'}</div>
            </div>
          ))}
        </div>

        <div className="card bg-[var(--surface)] border border-[var(--border)] px-4 py-3 flex items-center gap-3">
          <span>📄</span>
          {app.pdf_filename ? (
            <a
              href={`/api/applications/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-sm font-medium text-[var(--accent)] hover:underline truncate"
            >
              {app.pdf_filename}
            </a>
          ) : (
            <span className="flex-1 text-sm text-[var(--text2)]">PDF не прикреплён</span>
          )}
          <label className="shrink-0 cursor-pointer text-xs text-[var(--text2)] hover:text-[var(--accent)] border border-[var(--border)] rounded-lg px-2 py-1 transition">
            {pdfUploading ? '...' : app.pdf_filename ? '↑ Заменить' : '↑ Загрузить'}
            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfReupload} disabled={pdfUploading} />
          </label>
        </div>

        <div className="card bg-[var(--surface)] border border-[var(--border)] p-4 md:p-5">
          <label className="text-xs text-[var(--text3)] uppercase tracking-wide block mb-3">Заметки</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            className="w-full text-sm text-[var(--text)] bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] min-h-[80px]"
            placeholder="Добавьте заметку..."
          />
          {saving && <p className="text-xs text-[var(--text2)] mt-2">Сохраняю...</p>}
        </div>

        <div className="card bg-[var(--surface)] border border-[var(--border)] p-4 md:p-5">
          <h2 className="text-xs text-[var(--text3)] uppercase tracking-wide mb-4">История статусов</h2>
          <StatusHistory history={history} />
        </div>
      </div>
    </div>
  );
}
