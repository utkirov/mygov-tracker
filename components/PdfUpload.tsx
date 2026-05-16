'use client';

import { useRef, useState } from 'react';

import type { ParsedPdf } from '@/types';

interface Props {
  onParsed: (fields: ParsedPdf, filename: string, pdfStorageKey: string) => void;
}

export function PdfUpload({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    const isPdf =
      file.name.toLowerCase().endsWith('.pdf') ||
      file.type === 'application/pdf';

    if (!isPdf) {
      setError('Выберите PDF файл');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const form = new FormData();
      form.append('file', file);

      const response = await fetch('/api/applications/parse-pdf', {
        method: 'POST',
        body: form,
      });
      const payload = await response.json().catch(() => null) as
        | { fields?: ParsedPdf; filename?: string; pdfStorageKey?: string; error?: string }
        | null;

      if (!response.ok || !payload?.fields || !payload.filename || !payload.pdfStorageKey) {
        setError(payload?.error ?? 'Не удалось прочитать PDF');
        return;
      }

      onParsed(payload.fields, payload.filename, payload.pdfStorageKey);
    } catch {
      setError('Не удалось загрузить PDF. Проверь соединение и попробуй ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) {
          void handleFile(file);
        }
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-[32px] border-2 border-dashed p-8 text-center transition md:p-12 ${
        dragging
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.currentTarget.value = '';
        }}
      />

      <div className="mb-4 text-5xl font-semibold tracking-[0.28em] text-[var(--text-muted)] md:text-6xl">
        PDF
      </div>

      {loading ? (
        <p className="font-medium text-[var(--accent)]">Читаю PDF…</p>
      ) : (
        <>
          <p className="text-lg font-semibold text-[var(--text)]">Перетащите PDF сюда</p>
          <p className="mt-2 text-sm text-[var(--text-soft)]">
            или нажмите, чтобы выбрать файл для разбора
          </p>
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
    </div>
  );
}
