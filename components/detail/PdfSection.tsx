'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

import { formatDate, formatFileSize } from '@/lib/format-utils';
import { showToast } from '@/lib/toast';
import type { ApplicationArtifacts } from '@/types';

interface Props {
  applicationId: string;
  pdfFilename: string | null;
  pdfUploading: boolean;
  onPdfReupload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  artifacts: ApplicationArtifacts;
  completed: boolean;
  onArtifactsChange: (next: ApplicationArtifacts) => void;
}

function DocRow({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
      <FileText size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>
        {children}
      </div>
    </div>
  );
}

export default function PdfSection({
  applicationId,
  pdfFilename,
  pdfUploading,
  onPdfReupload,
  artifacts,
  completed,
  onArtifactsChange,
}: Props) {
  const [fetchingResults, setFetchingResults] = useState(false);
  const base = `/api/applications/${applicationId}/artifacts`;

  async function handleFetchResults() {
    setFetchingResults(true);
    try {
      const response = await fetch(base, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Не удалось получить документы');
      onArtifactsChange(payload as ApplicationArtifacts);
      showToast({ title: 'Документы результата получены', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Документы не получены', description: error instanceof Error ? error.message : 'Повторите попытку.', tone: 'error' });
    } finally {
      setFetchingResults(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <h2 className="mb-3 text-sm font-bold text-[var(--text)]">Документы</h2>

      <div className="space-y-2">
        <DocRow title={pdfFilename || 'PDF заявления'} subtitle={pdfFilename ? 'PDF заявления' : 'PDF пока не прикреплён'}>
          {pdfFilename && (
            <a href={`/api/applications/${applicationId}/pdf`} target="_blank" rel="noopener noreferrer">Открыть</a>
          )}
          <label className="cursor-pointer">
            {pdfUploading ? 'Загружаю…' : pdfFilename ? 'Заменить' : 'Загрузить'}
            <input type="file" accept=".pdf" className="hidden" onChange={onPdfReupload} disabled={pdfUploading} />
          </label>
        </DocRow>

        {artifacts.status_pdf && (
          <DocRow
            title="Статус my.gov (PDF)"
            subtitle={`снимок статуса · ${formatDate(artifacts.status_pdf.saved_at)} · ${formatFileSize(artifacts.status_pdf.size)}`}
          >
            <a href={`${base}/status.pdf?download=1`}>Скачать</a>
          </DocRow>
        )}

        {artifacts.results.map((doc) => (
          <DocRow
            key={doc.file}
            title={doc.title || 'Документ результата'}
            subtitle={[doc.state, doc.pin && `PIN ${doc.pin}`, formatFileSize(doc.size)].filter(Boolean).join(' · ')}
          >
            <a href={`${base}/${doc.file}`} target="_blank" rel="noopener noreferrer">Открыть</a>
            <a href={`${base}/${doc.file}?download=1`}>Скачать</a>
          </DocRow>
        ))}
      </div>

      {artifacts.results.length === 0 && (
        completed ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-[1.5] text-[var(--text-muted)]">
              Документы результата ещё не загружены.
            </p>
            <button
              type="button"
              onClick={() => void handleFetchResults()}
              disabled={fetchingResults}
              className="rounded-[9px] border px-3 py-1.5 text-xs font-medium transition hover:border-current disabled:opacity-60"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {fetchingResults ? 'Получаю…' : 'Получить с my.gov'}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-[11px] leading-[1.5] text-[var(--text-muted)]">
            Документы результата (решение, заключение) появятся здесь автоматически, когда заявление будет завершено.
          </p>
        )
      )}
    </section>
  );
}
