import { NextRequest, NextResponse } from 'next/server';

import { revokeShareLink } from '@/lib/share-links';

export const runtime = 'nodejs';

/** «Отозвать»: the link stops working at once. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await revokeShareLink(token);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Ссылка не найдена или уже отозвана' }, { status: 404 });
}
