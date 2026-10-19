import { NextRequest, NextResponse } from 'next/server';

import { currentSession } from '@/lib/auth-request';
import { DEFAULT_PUSH_PREFS, getPushPrefs, setPushPrefs } from '@/lib/push';

export const runtime = 'nodejs';

/** Notification preferences of this phone (app Settings, design A7). */
export async function GET(request: NextRequest) {
  const session = currentSession(request);
  if (!session) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const prefs = token ? await getPushPrefs(token, session.sid) : null;
  return NextResponse.json({ prefs: prefs ?? DEFAULT_PUSH_PREFS, registered: prefs !== null });
}

export async function PUT(request: NextRequest) {
  const session = currentSession(request);
  if (!session) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  const prefs = token ? await setPushPrefs(token, session.sid, body.prefs) : null;
  if (!prefs) return NextResponse.json({ error: 'Телефон не зарегистрирован для уведомлений — включите их сначала' }, { status: 404 });
  return NextResponse.json({ prefs });
}
