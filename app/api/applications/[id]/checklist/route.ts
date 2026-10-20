import { NextRequest, NextResponse } from 'next/server';

import { readChecklist, saveChecklist } from '@/lib/application-artifacts';
import { parseChecklist } from '@/lib/checklist';
import { getApplicationById } from '@/lib/local-db';
import { fetchApplicationHtml } from '@/lib/status-checker';

/** Approvals checklist saved by the last check (null until the first check after this feature). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  return NextResponse.json({ checklist: await readChecklist(id) });
}

/**
 * Re-reads the status page and rebuilds the checklist. Needed for archived
 * applications (they are no longer checked) and for an instant refresh.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplicationById(id);
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const page = await fetchApplicationHtml(application.application_number, application.verification_password);
  if (!page) return NextResponse.json({ error: 'my.gov.uz не ответил — попробуйте позже' }, { status: 502 });
  const checklist = parseChecklist(page.html);
  if (!checklist) return NextResponse.json({ error: 'На странице заявления нет этапов рассмотрения' }, { status: 404 });
  await saveChecklist(id, checklist);
  return NextResponse.json({ checklist });
}
