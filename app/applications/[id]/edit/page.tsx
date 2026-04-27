'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Application } from '@/types';
import { ProjectSelector } from '@/components/ProjectSelector';

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

  function set(key: keyof Application, value: string | null) {
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

  if (!form.id) return <div className="p-8 text-center text-[var(--text2)]">Загрузка...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-[var(--text2)] text-lg md:text-xl hover:text-[var(--text)]">←</button>
        <h1 className="font-bold text-lg md:text-xl text-[var(--text)]">Редактировать заявку</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col gap-5">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-xs text-[var(--text3)] uppercase tracking-wide block mb-2">{f.label}</label>
            {f.multiline ? (
              <textarea
                value={(form[f.key] as string) ?? ''}
                onChange={e => set(f.key, e.target.value)}
                className="w-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] min-h-[80px] resize-none"
              />
            ) : (
              <input
                value={(form[f.key] as string) ?? ''}
                onChange={e => set(f.key, e.target.value)}
                className="w-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            )}
          </div>
        ))}

        <div>
          <label className="text-xs text-[var(--text3)] uppercase tracking-wide block mb-2">Проект</label>
          <ProjectSelector
            value={(form.project_id as string | null) ?? null}
            onChange={(projectId) => set('project_id', projectId)}
          />
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition"
          >
            {saving ? 'Сохраняю...' : 'Сохранить изменения'}
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full border border-red-500/20 text-red-500 dark:border-red-500/30 dark:text-red-400 rounded-lg py-3 text-sm font-medium hover:bg-red-500/5 disabled:opacity-50 transition"
          >
            {deleting ? 'Удаляю...' : 'Удалить заявку'}
          </button>
        </div>
      </div>
    </div>
  );
}
