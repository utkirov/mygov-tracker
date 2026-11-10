import { NextResponse } from 'next/server';

import { readArtifactFile, readArtifacts } from '@/lib/application-artifacts';
import { readCachedAttachmentFiles } from '@/lib/attachments';
import { getApplicationById } from '@/lib/local-db';
import { readPdfFile } from '@/lib/local-storage';
import { makeZip, safeZipName, type ZipEntry } from '@/lib/zip-writer';

/**
 * «Скачать всё одним архивом»: the application PDF, the status PDF, the result
 * documents and the attachments already downloaded from the portal — one ZIP.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplicationById(id);
  if (!application) return NextResponse.json({ error: 'Заявление не найдено' }, { status: 404 });

  const entries: ZipEntry[] = [];
  const pdfKey = application.pdf_storage_key ?? application.pdf_filename;
  const pdf = pdfKey ? await readPdfFile(pdfKey) : null;
  if (pdf) entries.push({ name: `Заявление ${application.application_number}.pdf`, data: pdf });

  const artifacts = await readArtifacts(id);
  if (artifacts.status_pdf) {
    const data = await readArtifactFile(id, 'status.pdf');
    if (data) entries.push({ name: `Статус ${application.application_number}.pdf`, data });
  }
  for (const [i, r] of artifacts.results.entries()) {
    const data = await readArtifactFile(id, r.file);
    if (data) entries.push({ name: `Результат ${i + 1} - ${r.title || 'документ'}.pdf`, data });
  }
  for (const a of await readCachedAttachmentFiles(id)) entries.push({ name: `Вложение - ${a.name}`, data: a.data });

  if (entries.length === 0) return NextResponse.json({ error: 'У заявления пока нет сохранённых документов' }, { status: 404 });

  const filename = safeZipName(`${application.application_number} ${application.object_name || 'документы'}`) + '.zip';
  return new NextResponse(new Uint8Array(makeZip(entries)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="documents-${application.application_number}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
