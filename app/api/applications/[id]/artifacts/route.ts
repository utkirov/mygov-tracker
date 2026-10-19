import { NextRequest, NextResponse } from 'next/server';

import { readArtifacts, saveArtifacts } from '@/lib/application-artifacts';
import { getApplicationById } from '@/lib/local-db';
import { fetchRepositoryFiles } from '@/lib/repository-files';
import { fetchApplicationHtml } from '@/lib/status-checker';
import { isCompletedStatus } from '@/types';

/** Screenshot / status PDF / result documents stored for this application. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }
  return NextResponse.json(await readArtifacts(id));
}

/**
 * Re-downloads the official result documents of a completed application.
 * Completed applications are no longer checked, so documents that weren't
 * fetched at completion time (or were published later) need an explicit pull.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplicationById(id);
  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }
  if (!isCompletedStatus(application.status)) {
    return NextResponse.json({ error: 'Документы результата появляются только у завершённых заявлений' }, { status: 409 });
  }

  const page = await fetchApplicationHtml(application.application_number, application.verification_password);
  if (!page) {
    return NextResponse.json({ error: 'my.gov.uz не ответил — попробуйте позже' }, { status: 502 });
  }
  const files = await fetchRepositoryFiles(page.html);
  if (files.length === 0) {
    return NextResponse.json({ error: 'На странице заявления пока нет документов результата' }, { status: 404 });
  }
  return NextResponse.json(await saveArtifacts(id, { results: files }));
}
