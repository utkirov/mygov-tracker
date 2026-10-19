import { NextRequest, NextResponse } from 'next/server';

import {
  createSession,
  describeUserAgent,
  getUser,
  loginLockedFor,
  notifySecurity,
  recordLoginFailure,
  setPassword,
  validateNewPassword,
  verifyPassword,
} from '@/lib/auth';
import { clientIp, currentSession, isPublic, setSessionCookie } from '@/lib/auth-request';

export const runtime = 'nodejs';

/**
 * Creates the account (only from this PC / the LAN — never through the tunnel)
 * or changes the password (current password required). A password change logs
 * out every other session; the caller's own browser gets a fresh cookie.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const problem = validateNewPassword(newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const user = await getUser();
  const ip = clientIp(request);

  if (!user) {
    if (isPublic(request)) {
      return NextResponse.json({ error: 'Учётную запись можно создать только на компьютере с трекером или в домашней сети.' }, { status: 403 });
    }
    const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim().slice(0, 40) : 'admin';
    await setPassword(username, newPassword);
    void notifySecurity(`🔐 Создана учётная запись трекера «${username}». Теперь вход через домен защищён паролем.`);
    return NextResponse.json({ ok: true, created: true });
  }

  if (loginLockedFor(ip) > 0) {
    return NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 });
  }
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  if (!verifyPassword(currentPassword, user.password_hash)) {
    if (recordLoginFailure(ip)) void notifySecurity(`🚫 Смена пароля заблокирована на 15 минут: 5 неверных паролей.\nIP: ${ip}`);
    return NextResponse.json({ error: 'Текущий пароль неверный' }, { status: 401 });
  }

  const hadSession = !!currentSession(request);
  await setPassword(user.username, newPassword);
  void notifySecurity(`🔐 Пароль трекера изменён. Все устройства, кроме текущего, вышли из системы.\nIP: ${ip}`);

  const response = NextResponse.json({ ok: true, changed: true });
  if (hadSession) {
    const userAgent = request.headers.get('user-agent') ?? '';
    const session = await createSession({ username: user.username, kind: 'web', remember: true, deviceName: describeUserAgent(userAgent), ip, userAgent });
    setSessionCookie(response, request, session.token, session.maxAgeSeconds);
  }
  return response;
}
