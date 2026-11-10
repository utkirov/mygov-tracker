import { NextRequest, NextResponse } from 'next/server';

import { findShareLink, listShareViews, placeName, shareStats } from '@/lib/share-links';

export const runtime = 'nodejs';

/**
 * Who opened the link, when and where: device, app (Telegram, Chrome…), city
 * from Cloudflare and «Посетитель N» — numbered by first visit, so repeat
 * openings of one person are visible. No IPs are stored or returned.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findShareLink(token);
  if (!link) return NextResponse.json({ error: 'Ссылка не найдена' }, { status: 404 });
  const rows = await listShareViews(link.token, 300);
  const order = [...new Set([...rows].reverse().map(r => r.visitor || r.device))];
  const views = rows.slice(0, 100).map(r => ({
    viewed_at: r.viewed_at,
    device: r.device,
    app: r.app,
    place: placeName(r),
    visitor: `Посетитель ${order.indexOf(r.visitor || r.device) + 1}`,
  }));
  return NextResponse.json({ views, stats: await shareStats(link.token) });
}
