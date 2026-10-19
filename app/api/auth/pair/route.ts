import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

import { getUser } from '@/lib/auth';
import { createPairingCode } from '@/lib/device-pairing';

export const runtime = 'nodejs';

/**
 * Settings → «Приложение Android»: a fresh one-time QR for linking a phone.
 * Only reachable by someone already trusted (local network, or a signed-in
 * session through the domain — proxy.ts enforces that).
 */
export async function POST() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Сначала создайте учётную запись в разделе «Безопасность»' }, { status: 409 });
  }
  const { link, expiresAt } = createPairingCode(user.username);
  const svg = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return NextResponse.json({ link, expiresAt: expiresAt.toISOString(), svg });
}
