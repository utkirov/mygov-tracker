import { NextRequest, NextResponse } from 'next/server';

import { findShareLink, listShareViews } from '@/lib/share-links';

export const runtime = 'nodejs';

/** When the link was opened and from what kind of device (no IPs are stored). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await findShareLink(token))) return NextResponse.json({ error: 'Ссылка не найдена' }, { status: 404 });
  return NextResponse.json({ views: await listShareViews(token, 50) });
}
