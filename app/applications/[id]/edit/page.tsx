'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Application } from '@/types';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Partial<Application>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(r => r.json())
      .then(({ application }) => setForm(application));
  }, [id]);

  function set(key: keyof Application, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    router.push(`/applications/${id}`);
  }

  async function handleDelete() {
    if (!confirm('Удалить заявку? Это действие необратимо.')) return;
    setDeleting(true);
    await fetch(`/api/applications/${id}`, { method: 'DELETE' });
    router.push('/dashboard');
  }

  const fields: { label: string; key: keyof Application; multiline?: boolean }[] = [
    { label: 'Название объекта', key: 'object_name' },
    { label: 'Номер заявки', key: 'application_number' },
    { label: 'Пароль для проверки', key: 'verification_password' },
    { label: 'Наименование услуги', key: 'service_name', multiline: true },
    { label: 'Организация', key: 'organization', multiline: true },
    { label: 'SMS-телефон', key: 'sms_phone' },
    { label: 'Заметки', key: 'notes', multiline: true },
  ];

  if (!form.id) return <div className="p-8 text-center text-gray-400">Загрузка...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 text-lg">←</button>
        <h1 className="font-bold text-base">Редактировать заявку</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">{f.label}</label>
            {f.multiline ? (
              <textarea
                value={(form[f.key] as string) ?? ''}
                onChange={e => set(f.key, e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[70px] resize-none"
              />
            ) : (
              <input
                value={(form[f.key] as string) ?? ''}
                onChange={e => set(f.key, e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Сохраняю...' : 'Сохранить изменения'}
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full border border-red-300 text-red-600 rounded-lg py-3 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? 'Удаляю...' : 'Удалить заявку'}
        </button>
      </div>
    </div>
  );
}
