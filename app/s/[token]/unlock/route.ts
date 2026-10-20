import { NextRequest, NextResponse } from 'next/server';

import { checkSharePin, findShareLink, isShareLinkActive, unlockCookieName, unlockValue } from '@/lib/share-links';

export const runtime = 'nodejs';

/** PIN form of a protected share page: right PIN → cookie for this link only, back to the page. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Relative Location: behind the tunnel request.url is the local http address.
  const back = (state?: string) => new NextResponse(null, { status: 303, headers: { Location: `/s/${token}${state ? `?pin=${state}` : ''}` } });
  const link = await findShareLink(token);
  if (!link || !isShareLinkActive(link)) return back();
  const form = await request.formData().catch(() => null);
  const pin = String(form?.get('pin') ?? '').trim();
  const result = await checkSharePin(token, pin);
  if (result !== true) return back(result === 'locked' ? 'locked' : 'wrong');
  const response = back();
  response.cookies.set(unlockCookieName(token), (await unlockValue(token))!, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.headers.get('x-forwarded-proto') === 'https',
    path: `/s/${token}`,
    maxAge: link.expires_at ? Math.max(60, Math.floor((Date.parse(link.expires_at) - Date.now()) / 1000)) : 60 * 60 * 24 * 365,
  });
  return response;
}
