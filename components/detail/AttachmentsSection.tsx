'use client';

import { useCallback, useEffect, useState } from 'react';

import { DocRow } from '@/components/detail/PdfSection';
import { formatFileSize } from '@/lib/format-utils';
import { showToast } from '@/lib/toast';

interface Attachment {
  key: string;
  label: string;
  stage: string;
  file: { name: string; mime: string; size: number; saved_at: string } | null;
}

/** Files attached on the my.gov page (lib/attachments.ts): opened through our server, fetched from the portal on first use. */
export default function AttachmentsSection({ applicationId }: { applicationId: string }) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const base = `/api/applications/${applicationId}/attachments`;

  const fetchList = useCallback(async (refresh: boolean) => {
    const response = await fetch(`${base}${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Не удалось получить список');
    return payload.attachments as Attachment[];
  }, [base]);

  useEffect(() => {
    fetchList(false).then(setItems, () => setItems(prev => prev ?? []));
  }, [fetchList]);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await fetchList(true));
    } catch (error) {
      showToast({ title: 'Файлы не обновлены', description: error instanceof Error ? error.message : '', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Файлы заявления</h2>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="text-xs font-medium disabled:opacity-60" style={{ color: 'var(--accent)' }}>
          {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>

      {items === null ? (
        <p className="text-[11px] text-[var(--text-muted)]">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] leading-[1.5] text-[var(--text-muted)]">На странице my.gov к заявлению файлы не прикреплены.</p>
      ) : (
        <div className="space-y-2">
          {items.map(a => (
            <DocRow key={a.key} title={a.label}
              subtitle={a.file ? `${a.file.name.split('.').pop()?.toUpperCase()} · ${formatFileSize(a.file.size)}` : `${a.stage || 'my.gov'} · скачается с портала`}>
              <a href={`${base}/${a.key}`} target="_blank" rel="noopener noreferrer">Открыть</a>
              <a href={`${base}/${a.key}?download=1`}>Скачать</a>
            </DocRow>
          ))}
        </div>
      )}
    </section>
  );
}
