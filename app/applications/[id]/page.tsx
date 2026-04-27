// app/applications/[id]/page.tsx
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

  if (!app) return <div className="p-8 text-center text-gray-400">Загрузка...</div>;

  const type = getStatusType(app.acting_party, app.status);
  const bannerStyle = {
    action_required: 'bg-red-50 border-red-200 text-red-700',
    in_progress: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    completed: 'bg-green-50 border-green-200 text-green-700',
  }[type];

  const fields = [
    { label: 'Наименование услуги', value: app.service_name },
    { label: 'Организация', value: app.organization },
    { label: 'Дата подачи', value: app.submission_date ? new Date(app.submission_date).toLocaleString('ru-RU') : '—' },
    { label: 'Последнее изменение', value: app.last_changed_date ? new Date(app.last_changed_date).toLocaleString('ru-RU') : '—' },
    { label: 'Пароль для проверки', value: app.verification_password },
    { label: 'SMS-телефон', value: app.sms_phone },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 text-lg">←</button>
        <h1 className="font-bold text-base font-mono flex-1">№ {app.application_number}</h1>
        <button
          onClick={() => router.push(`/applications/${id}/edit`)}
          className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          Изменить
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-5">
        <div className={`border rounded-xl p-4 flex justify-between items-center gap-3 ${bannerStyle}`}>
          <div>
            <StatusBadge status={app.status} acting_party={app.acting_party} />
            {app.current_action && (
              <div className="text-sm mt-1">{app.current_action}</div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? '...' : '↻ Проверить'}
            </button>
            <a
              href={`/api/applications/${id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center border border-gray-300 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Оригинал ↗
            </a>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex flex-col gap-3">
          {fields.map(f => (
            <div key={f.label}>
              <div className="text-xs text-gray-400 uppercase tracking-wide">{f.label}</div>
              <div className="text-sm text-gray-900 mt-0.5">{f.value || '—'}</div>
            </div>
          ))}
        </div>

        <div className="bg-white border rounded-xl px-4 py-3 flex items-center gap-2">
          <span>📄</span>
          {app.pdf_filename ? (
            <a
              href={`/api/applications/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-sm font-medium text-blue-600 hover:underline truncate"
            >
              {app.pdf_filename}
            </a>
          ) : (
            <span className="flex-1 text-sm text-gray-400">PDF не прикреплён</span>
          )}
          <label className="shrink-0 cursor-pointer text-xs text-gray-400 hover:text-blue-600 border border-gray-200 rounded-lg px-2 py-1">
            {pdfUploading ? '...' : app.pdf_filename ? '↑ Заменить' : '↑ Загрузить'}
            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfReupload} disabled={pdfUploading} />
          </label>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <label className="text-xs text-gray-400 uppercase tracking-wide block mb-2">Заметки</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            className="w-full text-sm text-gray-900 resize-none focus:outline-none min-h-[60px]"
            placeholder="Добавьте заметку..."
          />
          {saving && <p className="text-xs text-gray-400 mt-1">Сохраняю...</p>}
        </div>

        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-xs text-gray-400 uppercase tracking-wide mb-3">История статусов</h2>
          <StatusHistory history={history} />
        </div>
      </div>
    </div>
  );
}
