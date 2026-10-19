'use client';

import { Download, ExternalLink } from 'lucide-react';

import { formatDate } from '@/lib/format-utils';
import type { ArtifactFile } from '@/types';

interface Props {
  applicationId: string;
  screenshot: ArtifactFile | null;
  checkable: boolean;
}

export default function ScreenshotSection({ applicationId, screenshot, checkable }: Props) {
  const src = screenshot
    ? `/api/applications/${applicationId}/artifacts/screenshot.png?v=${encodeURIComponent(screenshot.saved_at)}`
    : null;

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Скриншот страницы my.gov</h2>
        {screenshot && (
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {formatDate(screenshot.saved_at)}
          </span>
        )}
      </div>

      {src ? (
        <a href={src} target="_blank" rel="noopener noreferrer"
          className="block max-h-[520px] overflow-y-auto rounded-[10px] border"
          style={{ borderColor: 'var(--border)', background: '#fff' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local, auth-gated file; next/image adds nothing here */}
          <img src={src} alt="Страница статуса заявления на my.gov.uz" className="block w-full" />
        </a>
      ) : (
        <div className="rounded-[10px] p-4 text-xs leading-5" style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
          {checkable
            ? 'Скриншот появится после следующей проверки — или нажмите «Проверить».'
            : 'Скриншот делается при проверке. Для завершённых заявлений проверка остановлена.'}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {src && (
          <a href={`${src}&download=1`}
            className="inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-xs font-medium transition hover:border-current"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
            <Download size={13} />
            Скачать PNG
          </a>
        )}
        <a href={`/api/applications/${applicationId}/preview`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2 py-2 text-xs font-medium"
          style={{ color: 'var(--accent)' }}>
          <ExternalLink size={13} />
          Открыть оригинал
        </a>
      </div>
    </section>
  );
}
