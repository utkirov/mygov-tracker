import { NextRequest, NextResponse } from 'next/server';

import { isValidArtifactFileName, readArtifactFile, readArtifacts } from '@/lib/application-artifacts';
import { findShareLink, isShareLinkActive, isUnlocked, linkApplicationIds, unlockCookieName } from '@/lib/share-links';

export const runtime = 'nodejs';

/**
 * Result document for a client share link — only when the link allows documents,
 * only result PDFs, only applications the link covers (?app=<id> for client links).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await params;
  const link = await findShareLink(token);
  const notFound = NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!link || !isShareLinkActive(link) || !link.show_documents || !/^result-\d{1,2}\.pdf$/.test(file) || !isValidArtifactFileName(file)) return notFound;
  if (!(await isUnlocked(token, request.cookies.get(unlockCookieName(token))?.value))) return notFound;
  const allowed = await linkApplicationIds(link);
  const applicationId = link.application_id || request.nextUrl.searchParams.get('app') || '';
  if (!allowed.includes(applicationId)) return notFound;

  const buffer = await readArtifactFile(applicationId, file);
  if (!buffer) return notFound;
  const title = (await readArtifacts(applicationId)).results.find(r => r.file === file)?.title || 'Документ';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(title.replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf')}`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
