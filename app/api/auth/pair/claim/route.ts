import { NextRequest, NextResponse } from 'next/server';

import { createSession, loginLockedFor, notifySecurity, recordLoginFailure, recordLoginSuccess } from '@/lib/auth';
import { clientIp } from '@/lib/auth-request';
import { consumePairingCode } from '@/lib/device-pairing';

export const runtime = 'nodejs';

/** The phone trades a scanned QR code for its own device session (public, like login). */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const lockedMs = loginLockedFor(ip);
  if (lockedMs > 0) {
    return NextResponse.json({ error: `Слишком много попыток. Попробуйте через ${Math.ceil(lockedMs / 60000)} мин.` }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const device = body.device && typeof body.device === 'object' ? body.device as Record<string, unknown> : {};
  const deviceName = typeof device.name === 'string' && device.name.trim() ? device.name.trim() : 'Android';

  const username = code ? consumePairingCode(code) : null;
  if (!username) {
    if (recordLoginFailure(ip)) {
      void notifySecurity(`🚫 Привязка телефона заблокирована на 15 минут: 5 неверных кодов подряд.\nIP: ${ip}`);
    }
    return NextResponse.json({ error: 'QR-код недействителен или истёк — покажите новый в настройках' }, { status: 401 });
  }

  recordLoginSuccess(ip);
  const session = await createSession({
    username,
    kind: 'device',
    deviceName: `${deviceName} · приложение`,
    ip,
    userAgent: request.headers.get('user-agent') ?? '',
  });
  void notifySecurity(`📱 Телефон привязан по QR: ${deviceName}\nIP: ${ip}`);
  return NextResponse.json({ ok: true, token: session.token, expiresAt: session.expiresAt.toISOString() });
}
