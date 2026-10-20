// NOTE: In this Next.js fork (16.x), "Middleware" was renamed to "Proxy" — the file
// convention is `proxy.ts` (not `middleware.ts`) and the exported function is named
// `proxy` (not `middleware`). See node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/proxy.md. Proxy in this fork always runs on the Node.js runtime
// (the `runtime` config option isn't available here), so `process.env.APP_TOKEN` —
// set once at boot by instrumentation.ts's register() — is directly readable below;
// no next.config.ts `env` block or special wiring is needed.
import { NextRequest, NextResponse } from 'next/server';

import { isPrivateNetworkAddress, isValidAppToken } from '@/lib/app-token';
import { isAllowedHost, isCrossSiteRequest, isPublicRequest } from '@/lib/request-guards';
import { readSessionToken, SESSION_COOKIE, verifySession } from '@/lib/session-token';

// Reachable without a session from the internet: the login page and what it calls.
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/pair/claim', '/api/auth/me', '/api/health']);

const TOKEN_COOKIE_NAME = 'app_token';
const TOKEN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // ~1 year

function mintCookieResponse(expectedToken: string): NextResponse {
  const response = NextResponse.next();
  response.cookies.set(TOKEN_COOKIE_NAME, expectedToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TOKEN_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}

export function proxy(request: NextRequest) {
  const expectedToken = process.env.APP_TOKEN;
  const cookieValue = request.cookies.get(TOKEN_COOKIE_NAME)?.value ?? null;
  const queryValue = request.nextUrl.searchParams.get('token');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const host = request.headers.get('host');

  // DNS rebinding: a page on an attacker's domain re-pointed at this machine
  // would otherwise be trusted by IP (requests come from 127.0.0.1 / the LAN)
  // and could read every API response. Its Host header still names the
  // attacker's domain, so reject anything that isn't a local name.
  if (!isAllowedHost(host)) {
    return isApiRoute
      ? NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
      : new NextResponse('Host not allowed', { status: 403 });
  }

  // Requests from the internet (Cloudflare Tunnel / public domain): login only.
  // No IP trust (tunnel traffic arrives from 127.0.0.1) and no APP_TOKEN —
  // a valid signed session (cookie or Bearer for the Android app) is required.
  if (isPublicRequest(host, request.headers.get('x-app-via-tunnel'))) {
    const pathname = request.nextUrl.pathname;
    if (isApiRoute && isCrossSiteRequest(request.method, request.headers.get('origin'), request.headers.get('sec-fetch-site'), host)) {
      return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
    }
    if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    // Client share links: the page and its result documents check the token
    // themselves (lib/share-links.ts). Only GET — nothing there changes data.
    if (/^\/s\/[A-Za-z0-9_-]{20,64}(\/doc\/result-\d{1,2}\.pdf)?$/.test(pathname) && request.method === 'GET') {
      return NextResponse.next();
    }
    // The PIN form of a protected link (checked and rate-limited there).
    if (/^\/s\/[A-Za-z0-9_-]{20,64}\/unlock$/.test(pathname) && request.method === 'POST') {
      return NextResponse.next();
    }

    const token = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value, request.headers.get('authorization'));
    if (verifySession(token, process.env.SESSION_SECRET)) return NextResponse.next();

    if (isApiRoute) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Page routes (dashboard, settings, ...) are never gated — the UI shell
  // has no sensitive data on its own, and /api/* is the real trust boundary
  // below. But a page request IS where background-server.mjs's auto-opened
  // `?token=...` URL first lands, so this is where the cookie must actually
  // get minted — doing it here (before any React code runs, on the very
  // first document response) avoids a client-side race where a page's own
  // useEffect data-fetch could fire before a same-purpose client-side
  // bridge request resolves.
  if (!isApiRoute) {
    if (expectedToken && queryValue === expectedToken && cookieValue !== expectedToken) {
      return mintCookieResponse(expectedToken);
    }
    return NextResponse.next();
  }

  // scripts/background-server.mjs polls this unauthenticated (it has no fallback
  // if it 401s, unlike /api/network-info's client which falls back to OS-level
  // network detection) to know when the detached `next start` process is ready.
  // Health/status info isn't sensitive, so this stays open.
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next();
  }

  // CSRF: any website open in a browser on this machine or the LAN could
  // otherwise POST here (e.g. swap the Telegram bot token) and ride on the
  // IP-based trust below.
  if (isCrossSiteRequest(
    request.method,
    request.headers.get('origin'),
    request.headers.get('sec-fetch-site'),
    host
  )) {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
  }

  // Fail closed if the server hasn't finished booting (APP_TOKEN not yet set)
  // rather than letting every request through.
  if (!expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (cookieValue === expectedToken) {
    return NextResponse.next();
  }

  // Devices on the local network (and this machine itself) are trusted without
  // a token. server.mjs drops any client-sent x-forwarded-for and sets it to
  // the socket's remote address (plain `next start` would keep the client's
  // value, letting anyone claim 127.0.0.1), so IP trust is only honoured when
  // server.mjs flagged the header as trustworthy; only the first hop is checked.
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0];
  if (process.env.APP_TRUSTED_CLIENT_IP === '1' && isPrivateNetworkAddress(clientIp)) {
    return NextResponse.next();
  }

  if (isValidAppToken(cookieValue, queryValue, expectedToken)) {
    // Query-string token matched — mint the cookie so this device doesn't need
    // the query param on subsequent requests.
    return mintCookieResponse(expectedToken);
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  // Runs on every request except static assets — page routes opportunistically
  // mint the auth cookie from `?token=`; /api/* additionally enforces it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
