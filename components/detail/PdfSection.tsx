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
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Исходный файл</p>
          <h2 className="mt-1 text-sm font-bold text-[var(--text)]">PDF заявления</h2>
        </div>
        <label className="cursor-pointer rounded-[9px] border px-3 py-1.5 text-xs font-medium transition hover:border-current"
          style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}>
          {pdfUploading ? 'Загружаю…' : pdfFilename ? 'Заменить' : 'Загрузить PDF'}
          <input type="file" accept=".pdf" className="hidden" onChange={onPdfReupload} disabled={pdfUploading} />
        </label>
      </div>

      <div className="rounded-[10px] p-3 text-xs leading-5" style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
        {pdfFilename || 'PDF пока не прикреплён'}
      </div>
    </section>
  );
}
