import { NextRequest, NextResponse } from 'next/server';

import { parseAttachments, readAttachments, saveAttachmentList } from '@/lib/attachments';
import { getApplicationById } from '@/lib/local-db';
import { fetchApplicationHtml, MYGOV_ORIGIN } from '@/lib/status-checker';

export const runtime = 'nodejs';

/**
 * Files attached on the my.gov page. The list is saved by every check; until
 * the first one (or with ?refresh=1) the page is read here once.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplicationById(id);
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  let attachments = req.nextUrl.searchParams.get('refresh') === '1' ? null : await readAttachments(id);
  if (!attachments) {
    const page = await fetchApplicationHtml(application.application_number, application.verification_password);
    if (!page) return NextResponse.json({ error: 'my.gov.uz не ответил — попробуйте позже' }, { status: 502 });
    await saveAttachmentList(id, parseAttachments(page.html, MYGOV_ORIGIN));
    attachments = (await readAttachments(id)) ?? [];
  }
  // Portal URLs stay on the server: files are always served through /attachments/<key>.
  return NextResponse.json({ attachments: attachments.map(a => ({ key: a.key, label: a.label, stage: a.stage, file: a.file })) });
}
