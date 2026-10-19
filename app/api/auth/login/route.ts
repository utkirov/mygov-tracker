import { NextRequest, NextResponse } from 'next/server';

import {
  createSession,
  describeUserAgent,
  getUser,
  loginLockedFor,
  notifySecurity,
  recordLoginFailure,
  recordLoginSuccess,
  verifyPassword,
} from '@/lib/auth';
import { clientIp, isPublic, setSessionCookie } from '@/lib/auth-request';

export const runtime = 'nodejs';

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
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const device = body.device && typeof body.device === 'object' ? body.device as Record<string, unknown> : null;

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Учётная запись ещё не создана. Создайте её в настройках на компьютере с трекером.' }, { status: 409 });
  }

  if (username !== user.username || !verifyPassword(password, user.password_hash)) {
    if (recordLoginFailure(ip)) {
      void notifySecurity(`🚫 Вход в трекер заблокирован на 15 минут: 5 неверных паролей подряд.\nIP: ${ip}`);
    }
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
  }

  recordLoginSuccess(ip);
  const userAgent = request.headers.get('user-agent') ?? '';
  const session = await createSession({
    username: user.username,
    kind: device ? 'device' : 'web',
    remember: body.remember === true,
    deviceName: device && typeof device.name === 'string' ? device.name : describeUserAgent(userAgent),
    ip,
    userAgent,
  });

  if (isPublic(request) || device) {
    void notifySecurity(`🔐 Вход в трекер: ${device && typeof device.name === 'string' ? device.name : describeUserAgent(userAgent)}\nIP: ${ip}`);
  }

  if (device) {
    return NextResponse.json({ ok: true, token: session.token, expiresAt: session.expiresAt.toISOString() });
  }
  const response = NextResponse.json({ ok: true, expiresAt: session.expiresAt.toISOString() });
  setSessionCookie(response, request, session.token, body.remember === true ? session.maxAgeSeconds : undefined);
  return response;
}
