import { NextRequest, NextResponse } from 'next/server';

import { isValidArtifactFileName, readArtifactFile, readArtifacts } from '@/lib/application-artifacts';
import { findShareLink, isShareLinkActive } from '@/lib/share-links';

export const runtime = 'nodejs';

/** Result document for a client share link — only when the link allows documents, only result PDFs. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await params;
  const link = await findShareLink(token);
  if (!link || !isShareLinkActive(link) || !link.show_documents || !/^result-\d{1,2}\.pdf$/.test(file) || !isValidArtifactFileName(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const buffer = await readArtifactFile(link.application_id, file);
  if (!buffer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const title = (await readArtifacts(link.application_id)).results.find(r => r.file === file)?.title || 'Документ';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(title.replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf')}`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
