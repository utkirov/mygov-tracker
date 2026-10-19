'use client';

import SectionHeading from './SectionHeading';

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
      <SectionHeading
        eyebrow="Исходный файл"
        title="PDF заявления"
        action={(
          <label className="cursor-pointer rounded-[9px] border px-3 py-1.5 text-xs font-medium transition hover:border-current"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}>
            {pdfUploading ? 'Загружаю…' : pdfFilename ? 'Заменить' : 'Загрузить PDF'}
            <input type="file" accept=".pdf" className="hidden" onChange={onPdfReupload} disabled={pdfUploading} />
          </label>
        )}
      />

      <div className="rounded-[10px] p-3 text-xs leading-5" style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
        {pdfFilename || 'PDF пока не прикреплён'}
      </div>
    </section>
  );
}
