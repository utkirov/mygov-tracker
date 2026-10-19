import type { NextRequest, NextResponse } from 'next/server';

import { readSession } from './auth';
import { isPublicRequest } from './request-guards';
import { readSessionToken, SESSION_COOKIE, type SessionPayload } from './session-token';

export function clientIp(request: NextRequest): string {
  return request.headers.get('x-app-client-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
}

export function isPublic(request: NextRequest): boolean {
  return isPublicRequest(request.headers.get('host'), request.headers.get('x-app-via-tunnel'));
}

export function currentSession(request: NextRequest): SessionPayload | null {
  return readSession(readSessionToken(request.cookies.get(SESSION_COOKIE)?.value, request.headers.get('authorization')));
}

export function setSessionCookie(response: NextResponse, request: NextRequest, token: string, maxAgeSeconds: number | undefined): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Through the tunnel the browser talks HTTPS to Cloudflare.
    secure: isPublic(request),
    path: '/',
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}
