'use client';

interface Props {
  applicationId: string;
  pdfFilename: string | null;
  pdfUploading: boolean;
  onPdfReupload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PdfSection({
  pdfFilename,
  pdfUploading,
  onPdfReupload,
}: Props) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Исходный файл
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            PDF заявления
          </h2>
        </div>
        <label className="cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)]">
          {pdfUploading ? 'Загружаю…' : pdfFilename ? 'Заменить PDF' : 'Загрузить PDF'}
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={onPdfReupload}
            disabled={pdfUploading}
          />
        </label>
      </div>

      <div className="mt-4 rounded-[24px] bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--text-soft)]">
        {pdfFilename || 'PDF пока не прикреплён'}
      </div>
    </section>
  );
}
