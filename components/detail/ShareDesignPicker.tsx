'use client';

import { startTransition, useEffect, useState } from 'react';

import { showToast } from '@/lib/toast';

interface DesignOption { id: string; letter: string; label: string; hint: string }

const SWATCH: Record<string, [string, string, string]> = {
  light: ['#F3F1EC', '#FFFFFF', '#7C4DFF'],
  dark: ['#0C0C0E', '#151518', '#A688FF'],
  summary: ['#F3F1EC', '#7C4DFF', '#0C0C0E'],
  'summary-dark': ['#0C0C0E', '#7C4DFF', '#F3F1EC'],
  timeline: ['#FFFFFF', '#A688FF', '#7C4DFF'],
  'timeline-dark': ['#0C0C0E', '#151518', '#A688FF'],
  'timeline-auto': ['#F3F1EC', '#0C0C0E', '#7C4DFF'],
  brand: ['#7C4DFF', '#2B1466', '#F3F1EC'],
};

/** «Вид страницы клиента»: the default look of every share link (lib/share-design.ts), with a preview on a real link. */
export function ShareDesignPicker({ previewUrl }: { previewUrl: string | null }) {
  const [state, setState] = useState<{ design: string; designs: DesignOption[] } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/share-design', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { design: string; designs: DesignOption[] } | null) => { if (d) startTransition(() => setState(d)); })
      .catch(() => undefined);
  }, []);

  async function choose(id: string) {
    setSaving(id);
    try {
      const r = await fetch('/api/share-design', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design: id }) });
      if (!r.ok) throw new Error();
      setState(s => (s ? { ...s, design: id } : s));
      showToast({ title: 'Вид страницы сохранён', description: 'Все ссылки клиентов открываются в этом виде', tone: 'success' });
    } catch {
      showToast({ title: 'Не сохранено', tone: 'error' });
    } finally {
      setSaving(null);
    }
  }

  if (!state) return null;
  return (
    <section className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-[14px] font-bold text-[var(--text)]">Вид страницы клиента</h2>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
        Как выглядит ссылка у клиента. Сверху всегда контакты TURON PROJECT. «Посмотреть» открывает настоящую ссылку в этом виде — просмотр не засчитывается.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {state.designs.map(d => {
          const active = state.design === d.id;
          const [a, b, c] = SWATCH[d.id] ?? SWATCH.light;
          return (
            <div key={d.id} className="rounded-[12px] border p-3"
              style={{ borderColor: active ? 'var(--accent)' : 'var(--border)', boxShadow: active ? 'var(--accent-glow)' : undefined }}>
              <div className="flex h-14 overflow-hidden rounded-[8px] border border-[var(--border)]">
                <span className="flex-[3]" style={{ background: a }} />
                <span className="flex-[2]" style={{ background: b }} />
                <span className="flex-1" style={{ background: c }} />
              </div>
              <p className="mt-2 text-[13px] font-semibold text-[var(--text)]">{d.letter} · {d.label}{active ? ' — выбран' : ''}</p>
              <p className="mt-0.5 text-[11px] leading-[1.4] text-[var(--text-muted)]">{d.hint}</p>
              <div className="mt-2 flex gap-3 text-[12px] font-medium">
                {!active && (
                  <button type="button" disabled={saving !== null} onClick={() => void choose(d.id)} style={{ color: 'var(--accent)' }}>
                    {saving === d.id ? 'Сохраняю…' : 'Выбрать'}
                  </button>
                )}
                {previewUrl && (
                  <a href={`${previewUrl}?design=${d.id}&own=1`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Посмотреть</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
