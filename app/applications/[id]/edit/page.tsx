'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Application } from '@/types';
import { showToast } from '@/lib/toast';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Partial<Application>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Не удалось сохранить заявку');
      router.push(`/applications/${id}`);
    } catch (error) {
      showToast({ title: 'Сохранение не выполнено', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(typeof result.error === 'string' ? result.error : 'Не удалось удалить заявку');
      }
      router.push('/dashboard');
    } catch (error) {
      showToast({ title: 'Удаление не выполнено', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  const inputCls = "w-full rounded-[10px] border px-3 py-2.5 text-[13px] outline-none transition focus:border-[var(--accent)]";
  const inputSty = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };
  const cardSty  = { background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' };

  const fields: { label: string; key: keyof Application; multiline?: boolean }[] = [
    { label: 'Название объекта',    key: 'object_name' },
    { label: 'Номер заявки',        key: 'application_number' },
    { label: 'Пароль для проверки', key: 'verification_password' },
    { label: 'Наименование услуги', key: 'service_name',  multiline: true },
    { label: 'Организация',         key: 'organization',  multiline: true },
    { label: 'SMS-телефон',         key: 'sms_phone' },
    { label: 'Заметки',             key: 'notes',         multiline: true },
  ];

  if (!form.id) {
    return (
      <div className="flex h-[calc(100svh-56px)] items-center justify-center text-[13px]"
        style={{ color: 'var(--text-muted)' }}>
        Загрузка…
      </div>
    );
  }

  return (
    <div className="overflow-y-auto px-4 py-4 md:px-6 md:py-6 animate-fade-up">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">

        {/* Header card */}
        <div className="rounded-[12px] border p-4 md:p-5" style={cardSty}>
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition hover:bg-[var(--panel)] active:scale-90"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="text-[10px] font-semibold " style={{ color: 'var(--text-muted)' }}>
                Редактирование
              </p>
              <h1 className="mt-1 text-[18px] font-semibold leading-[1.3] tracking-[-0.02em] md:text-[20px]"
                style={{ color: 'var(--text)' }}>
                {form.object_name || form.service_name || 'Заявка'}
              </h1>
              <p className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                № {form.application_number}
              </p>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="rounded-[12px] border p-4 md:p-5" style={cardSty}>
          <h2 className="mb-4 text-[13px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Данные заявки
          </h2>
          <div className="space-y-4">
            {fields.map(f => (
              <label key={f.key} className="block">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>{f.label}</span>
                {f.multiline ? (
                  <textarea
                    value={(form[f.key] as string) ?? ''}
                    onChange={e => set(f.key, e.target.value)}
                    className={`mt-1.5 min-h-[80px] resize-none ${inputCls}`}
                    style={inputSty}
                  />
                ) : (
                  <input
                    value={(form[f.key] as string) ?? ''}
                    onChange={e => set(f.key, e.target.value)}
                    className={`mt-1.5 ${inputCls}`}
                    style={inputSty}
                  />
                )}
              </label>
            ))}

          </div>
        </div>

        {/* Actions */}
        <div className="rounded-[12px] border p-4 md:p-5" style={cardSty}>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-[11px] px-4 py-3.5 text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              {saving ? 'Сохраняю…' : 'Сохранить изменения'}
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-2 rounded-[10px] border px-3 py-2.5"
                style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)' }}>
                <span className="flex-1 text-[12px] font-medium" style={{ color: 'var(--danger)' }}>
                  Удалить безвозвратно?
                </span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition active:scale-95"
                  style={{ color: 'var(--text-soft)' }}
                >
                  Отмена
                </button>
                <button
                  onClick={() => { setConfirmDelete(false); void handleDelete(); }}
                  disabled={deleting}
                  className="rounded-[7px] px-3 py-1 text-[12px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
                  style={{ background: 'var(--danger)' }}
                >
                  {deleting ? 'Удаляю…' : 'Удалить'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-[10px] border px-4 py-2.5 text-[13px] font-medium transition active:scale-[0.98]"
                style={{ borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)', color: 'var(--danger)' }}
              >
                Удалить заявку
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
