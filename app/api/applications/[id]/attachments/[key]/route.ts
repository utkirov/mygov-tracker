import { NextRequest, NextResponse } from 'next/server';

import { getAttachmentFile } from '@/lib/attachments';
import { getApplicationById } from '@/lib/local-db';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; key: string }> };

async function load(id: string, key: string) {
  const application = await getApplicationById(id);
  if (!application) throw new Error('Заявление не найдено');
  return getAttachmentFile(id, key, application.application_number);
}

/** The file itself (fetched from my.gov the first time). ?download=1 → save instead of open. */
export async function GET(req: NextRequest, { params }: Params) {
  const { id, key } = await params;
  try {
    const { info, data } = await load(id, key);
    const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const ascii = info.name.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, '');
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': info.mime,
        'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(info.name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Файл не получен' }, { status: 502 });
  }
}

/** Fetches the file into the local cache and returns its name/type — the app needs them before downloading. */
export async function POST(_: NextRequest, { params }: Params) {
  const { id, key } = await params;
  try {
    const { info } = await load(id, key);
    return NextResponse.json({ file: info });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Файл не получен' }, { status: 502 });
  }
}
