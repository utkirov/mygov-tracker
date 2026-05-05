import { NextRequest, NextResponse } from 'next/server';

import { deletePdfFile, readPdfFile, savePdfFile } from '@/lib/local-storage';
import { readLocalDb, writeLocalDb } from '@/lib/local-db';

async function loadApplicationPdf(id: string) {
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return { db, application: null, buffer: null };
  }

  const preferredKey = application.pdf_storage_key ?? application.pdf_filename;
  const buffer =
    (preferredKey ? await readPdfFile(preferredKey) : null) ??
    (application.pdf_filename && application.pdf_filename !== preferredKey
      ? await readPdfFile(application.pdf_filename)
      : null);

  return { db, application, buffer };
}

function buildPdfResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename || 'document.pdf')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { application, buffer } = await loadApplicationPdf(id);

  if (!application || !buffer) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
  }

  return buildPdfResponse(buffer, application.pdf_filename || 'document.pdf');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File not found' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const previousStorageKey = application.pdf_storage_key ?? application.pdf_filename;
  const pdfStorageKey = await savePdfFile(buffer, file.name);

  application.pdf_filename = file.name;
  application.pdf_storage_key = pdfStorageKey;
  application.updated_at = new Date().toISOString();
  db.meta.updated_at = application.updated_at;

  await writeLocalDb(db);

  if (previousStorageKey && previousStorageKey !== pdfStorageKey) {
    await deletePdfFile(previousStorageKey);
  }

  return NextResponse.json({
    ok: true,
    filename: application.pdf_filename,
    pdfStorageKey: application.pdf_storage_key,
  });
}
