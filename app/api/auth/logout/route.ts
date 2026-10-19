import { NextRequest, NextResponse } from 'next/server';

import { revokeSession } from '@/lib/auth';
import { clearSessionCookie, currentSession } from '@/lib/auth-request';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = currentSession(request);
  if (session) await revokeSession(session.sid);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
