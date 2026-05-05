import { NextRequest, NextResponse } from 'next/server';

import { deletePdfFile, savePdfFile } from '@/lib/local-storage';
import { parsePdfBuffer } from '@/lib/pdf-parser';

async function cleanupTempPdf(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const pdfStorageKey = typeof body.pdfStorageKey === 'string' ? body.pdfStorageKey.trim() : '';
  if (!pdfStorageKey) {
    return NextResponse.json({ error: 'pdfStorageKey is required' }, { status: 400 });
  }

  const deleted = await deletePdfFile(pdfStorageKey);
  return NextResponse.json({ ok: true, deleted });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return cleanupTempPdf(request);
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File not found' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const fields = await parsePdfBuffer(buffer);
    const pdfStorageKey = await savePdfFile(buffer, file.name);

    return NextResponse.json({
      fields,
      filename: file.name,
      pdfStorageKey,
    });
  } catch (error) {
    console.error('Failed to parse uploaded PDF:', error);
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 });
  }
}
