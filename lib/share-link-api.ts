/** Shared request/response helpers for the share-link API routes (application and client links). */
import { NextRequest, NextResponse } from 'next/server';

import { countSubscribers, isShareLinkActive, SHARE_DURATIONS, shareUrl, type ShareLink } from './share-links';

export async function serializeLinks(links: ShareLink[]) {
  const subs = await countSubscribers(links.map(l => l.token));
  return links.map(l => ({ ...l, url: shareUrl(l.token), active: isShareLinkActive(l), subscribers: subs.get(l.token) ?? 0 }));
}

/** Validates the «create link» body; returns options or an error response. */
export async function readCreateBody(request: NextRequest): Promise<{ minutes: number | null; label: string; showDocuments: boolean; pin: string } | NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const minutes = body.minutes === null ? null : Number(body.minutes);
  if (!(SHARE_DURATIONS as readonly (number | null)[]).includes(minutes)) {
    return NextResponse.json({ error: 'Выберите срок: 30 мин, 1 час, 1 день, 7 дней, 30 дней или бессрочно' }, { status: 400 });
  }
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (pin && !/^\d{4,8}$/.test(pin)) return NextResponse.json({ error: 'PIN — от 4 до 8 цифр' }, { status: 400 });
  return {
    minutes,
    label: typeof body.label === 'string' ? body.label : '',
    showDocuments: body.showDocuments === true,
    pin,
  };
}
