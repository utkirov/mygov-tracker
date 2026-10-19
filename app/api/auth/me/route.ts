import { NextRequest, NextResponse } from 'next/server';

import { getUser } from '@/lib/auth';
import { currentSession, isPublic } from '@/lib/auth-request';

export const runtime = 'nodejs';

/** Open to unauthenticated public requests (the login page needs it); reveals nothing sensitive. */
export async function GET(request: NextRequest) {
  const user = await getUser();
  const session = currentSession(request);
  return NextResponse.json({
    configured: !!user,
    public: isPublic(request),
    authenticated: !!session,
    username: session ? session.uid : null,
    sessionId: session?.sid ?? null,
  });
}
