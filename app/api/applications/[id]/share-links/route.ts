import { NextRequest, NextResponse } from 'next/server';

import { getApplicationById } from '@/lib/local-db';
import { createShareLink, isShareLinkActive, listShareLinks, SHARE_DURATIONS, type ShareLink } from '@/lib/share-links';

export const runtime = 'nodejs';

/** Public address (Cloudflare Tunnel) — links are for clients outside the office network. */
function shareUrl(token: string): string {
  const base = (process.env.PUBLIC_BASE_URL?.trim() || 'https://tracker.turonproject.uz').replace(/\/+$/, '');
  return `${base}/s/${token}`;
}

const withUrl = (link: ShareLink) => ({ ...link, url: shareUrl(link.token), active: isShareLinkActive(link) });

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  return NextResponse.json({ links: (await listShareLinks(id)).map(withUrl) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getApplicationById(id))) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
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
  const link = await createShareLink(id, {
    minutes,
    label: typeof body.label === 'string' ? body.label : '',
    showDocuments: body.showDocuments === true,
  });
  return NextResponse.json({ link: withUrl(link) }, { status: 201 });
}
