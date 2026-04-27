'use client';
// components/PdfUpload.tsx
import { useRef, useState } from 'react';
import type { ParsedPdf } from '@/types';

interface Props {
  onParsed: (fields: ParsedPdf, filename: string) => void;
}

export function PdfUpload({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Выберите PDF файл');
      return;
    }
    setError('');
    setLoading(true);

    const form = new FormData();
    form.append('file', file);

    const res = await fetch('/api/applications/parse-pdf', { method: 'POST', body: form });
    if (!res.ok) {
      setError('Не удалось прочитать PDF');
      setLoading(false);
      return;
    }

    const { fields, filename } = await res.json();
    onParsed(fields, filename);
    setLoading(false);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-blue-300 bg-blue-50 hover:bg-blue-100'}`}
    >
      <input ref={inputRef} type="file" accept=".pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <div className="text-4xl mb-3">📄</div>
      {loading ? (
        <p className="text-blue-600 font-medium">Читаю PDF...</p>
      ) : (
        <>
          <p className="text-blue-700 font-semibold">Перетащите PDF сюда</p>
          <p className="text-gray-500 text-sm mt-1">или нажмите чтобы выбрать файл</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
