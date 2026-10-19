import { NextRequest, NextResponse } from 'next/server';

import { isValidArtifactFileName, readArtifactFile, readArtifacts } from '@/lib/application-artifacts';
import { getApplicationById } from '@/lib/local-db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  if (!isValidArtifactFileName(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const application = await getApplicationById(id);
  const buffer = application ? await readArtifactFile(id, file) : null;
  if (!application || !buffer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isPng = file.endsWith('.png');
  const number = application.application_number;
  let downloadName = isPng ? `screenshot-${number}.png` : `status-${number}.pdf`;
  if (file.startsWith('result-')) {
    const meta = (await readArtifacts(id)).results.find((r) => r.file === file);
    downloadName = `${meta?.title || 'Документ'} ${number}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  }
  const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': isPng ? 'image/png' : 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${isPng ? 'screenshot.png' : 'document.pdf'}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      'Cache-Control': 'no-store',
    },
  });
}
