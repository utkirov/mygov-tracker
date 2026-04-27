// app/add/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedPdf } from '@/types';
import { PdfUpload } from '@/components/PdfUpload';

export default function AddPage() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedPdf | null>(null);
  const [filename, setFilename] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
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
      body: JSON.stringify({ ...parsed, notes, pdf_filename: filename }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg ?? 'Ошибка сохранения');
      setSaving(false);
      return;
    }

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
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 text-lg">←</button>
        <h1 className="font-bold text-lg">Новая заявка</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
        {!parsed ? (
          <PdfUpload onParsed={handleParsed} />
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-700 font-semibold text-sm mb-3">✓ Данные извлечены из PDF</p>
              <div className="flex flex-col gap-2">
                {fields.map(f => (
                  <div key={f.key} className="flex justify-between text-sm gap-2">
                    <span className="text-gray-500 shrink-0">{f.label}</span>
                    <span className="font-medium text-right">{parsed[f.key] || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Заметка (необязательно)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Проект, объект, контекст..."
                className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setParsed(null); setFilename(''); }}
                className="flex-1 border border-gray-300 rounded-lg py-3 text-sm font-medium hover:bg-gray-50"
              >
                Загрузить другой PDF
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Сохраняю...' : 'Сохранить заявку'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
