import { NextRequest, NextResponse } from 'next/server';

import { getUser, listSessions, revokeAllSessions, revokeSession } from '@/lib/auth';
import { clearSessionCookie, currentSession } from '@/lib/auth-request';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ sessions: [] });
  const current = currentSession(request)?.sid ?? null;
  const sessions = (await listSessions(user.username)).map((s) => ({ ...s, current: s.id === current }));
  return NextResponse.json({ sessions });
}

/** DELETE ?id=<sessionId> revokes one session; DELETE without id logs out everywhere. */
export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: true });
  const id = request.nextUrl.searchParams.get('id');
  const current = currentSession(request)?.sid ?? null;

  if (id) {
    await revokeSession(id);
  } else {
    await revokeAllSessions(user.username);
  }

  const response = NextResponse.json({ ok: true });
  if (!id || id === current) clearSessionCookie(response);
  return response;
}
