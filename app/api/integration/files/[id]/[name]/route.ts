import { NextRequest, NextResponse } from 'next/server';

import { isValidArtifactFileName, readArtifactFile } from '@/lib/application-artifacts';
import { readCachedAttachment } from '@/lib/attachments';
import { erpKeyOk } from '@/lib/erp';

export const runtime = 'nodejs';

/** Для ERP: сам файл из хранилища трекера (result-N.pdf или att-<key>). Портал не опрашивается. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; name: string }> }) {
  if (!erpKeyOk(req)) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const { id, name } = await params;
  let data: Buffer | null = null;
  let mime = 'application/pdf';
  if (isValidArtifactFileName(name) && name.startsWith('result-')) {
    data = await readArtifactFile(id, name);
  } else if (/^att-[\w-]{1,64}$/.test(name)) {
    const cached = await readCachedAttachment(id, name.slice(4));
    if (cached) { data = cached.data; mime = cached.info.mime; }
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } });
}
