import { NextRequest, NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth-request';
import { registerPushDevice, unregisterPushDevice } from '@/lib/push';

export const runtime = 'nodejs';

const TOKEN_RE = /^[\w:.-]{20,4096}$/;

/** The Android app posts its FCM token after login (Bearer device token). */
export async function POST(request: NextRequest) {
  const session = currentSession(request);
  if (!session) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Неверный push-токен' }, { status: 400 });

  await registerPushDevice({
    token,
    sessionId: session.sid,
    platform: typeof body.platform === 'string' ? body.platform : 'android',
    deviceName: typeof body.deviceName === 'string' ? body.deviceName : '',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!currentSession(request)) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (TOKEN_RE.test(token)) await unregisterPushDevice(token);
  return NextResponse.json({ ok: true });
}
