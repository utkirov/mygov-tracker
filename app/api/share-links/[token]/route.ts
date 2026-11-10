import { NextRequest, NextResponse } from 'next/server';

import { serializeLinks } from '@/lib/share-link-api';
import { extendShareLink, revokeShareLink, SHARE_DURATIONS } from '@/lib/share-links';

export const runtime = 'nodejs';

/** «Продлить»: body { minutes } — a lifetime from the offered list, null = until revoked. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null) as { minutes?: unknown } | null;
  const minutes = body?.minutes === null ? null : Number(body?.minutes);
  if (!(SHARE_DURATIONS as readonly (number | null)[]).includes(minutes)) {
    return NextResponse.json({ error: 'Выберите срок: 30 мин, 1 час, 1 день, 7 дней, 30 дней или бессрочно' }, { status: 400 });
  }
  const link = await extendShareLink(token, minutes);
  if (!link) return NextResponse.json({ error: 'Ссылка не найдена или отозвана' }, { status: 404 });
  const [serialized] = await serializeLinks([link]);
  return NextResponse.json({ link: serialized });
}

/** «Отозвать»: the link stops working at once. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await revokeShareLink(token);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Ссылка не найдена или уже отозвана' }, { status: 404 });
}
