import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed session tokens, verified in proxy.ts without touching the
 * database (proxy can't load the native SQLite module). Revocation works via
 * an in-process state object on globalThis, loaded from SQLite at boot by
 * lib/auth.ts and updated on every login/logout — proxy and route handlers run
 * in the same Node process, so they share it.
 *
 * Token: base64url(JSON payload) "." base64url(HMAC-SHA256(payload, SESSION_SECRET))
 */
export interface SessionPayload {
  /** session id (row in auth_sessions) */
  sid: string;
  /** username */
  uid: string;
  /** user's session_version at issue time — "log out everywhere" bumps it */
  v: number;
  /** expiry, unix seconds */
  exp: number;
  k: 'web' | 'device';
}

export interface AuthState {
  loaded: boolean;
  versions: Record<string, number>;
  revoked: Set<string>;
}

export const SESSION_COOKIE = 'mg_session';

export function getAuthState(): AuthState {
  const g = globalThis as typeof globalThis & { __mgAuthState?: AuthState };
  g.__mgAuthState ??= { loaded: false, versions: {}, revoked: new Set() };
  return g.__mgAuthState;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(
  token: string | null | undefined,
  secret: string | undefined,
  state: AuthState = getAuthState(),
  nowMs: number = Date.now()
): SessionPayload | null {
  if (!token || !secret || !state.loaded) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
  if (state.versions[payload.uid] !== payload.v) return null;
  if (state.revoked.has(payload.sid)) return null;
  return payload;
}

/** Session token from the cookie or an `Authorization: Bearer` header (Android app). */
export function readSessionToken(cookieValue: string | null | undefined, authorization: string | null | undefined): string | null {
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim() || null;
  return cookieValue || null;
}
