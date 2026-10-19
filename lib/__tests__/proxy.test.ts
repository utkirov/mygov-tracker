import { NextRequest } from 'next/server';

import { proxy } from '../../proxy';

const TOKEN = 'test-token';

function makeRequest(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? 'GET',
    headers: { host: 'localhost:3000', ...init.headers },
  });
}

describe('proxy', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_TOKEN = TOKEN;
    process.env.APP_TRUSTED_CLIENT_IP = '1';
    delete process.env.APP_ALLOWED_HOSTS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects a foreign Host (DNS rebinding)', () => {
    const response = proxy(makeRequest('/api/applications', {
      headers: { host: 'rebind.evil.example:3000', 'x-forwarded-for': '127.0.0.1' },
    }));
    expect(response.status).toBe(403);
  });

  it('trusts a private socket address when server.mjs vouches for it', () => {
    const response = proxy(makeRequest('/api/applications', { headers: { 'x-forwarded-for': '192.168.1.20' } }));
    expect(response.status).toBe(200);
  });

  it('ignores x-forwarded-for when not running behind server.mjs', () => {
    delete process.env.APP_TRUSTED_CLIENT_IP;
    const response = proxy(makeRequest('/api/applications', { headers: { 'x-forwarded-for': '127.0.0.1' } }));
    expect(response.status).toBe(401);
  });

  it('still accepts the token cookie without IP trust', () => {
    delete process.env.APP_TRUSTED_CLIENT_IP;
    const response = proxy(makeRequest('/api/applications', { headers: { cookie: `app_token=${TOKEN}` } }));
    expect(response.status).toBe(200);
  });

  it('blocks a cross-site POST even from a trusted address', () => {
    const response = proxy(makeRequest('/api/settings', {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1', origin: 'https://evil.example.com' },
    }));
    expect(response.status).toBe(403);
  });

  it('allows a same-origin POST', () => {
    const response = proxy(makeRequest('/api/settings', {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.1', origin: 'http://localhost:3000' },
    }));
    expect(response.status).toBe(200);
  });

  it('keeps /api/health open', () => {
    const response = proxy(makeRequest('/api/health', { headers: { 'x-forwarded-for': '8.8.8.8' } }));
    expect(response.status).toBe(200);
  });
});

describe('proxy — public requests (Cloudflare Tunnel / domain)', () => {
  const originalEnv = { ...process.env };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAuthState, signSession } = require('../session-token') as typeof import('../session-token');
  const SECRET = 'proxy-test-secret';
  const tunnel = { 'x-forwarded-for': '127.0.0.1', 'x-app-via-tunnel': '1' };

  beforeEach(() => {
    process.env.APP_TOKEN = TOKEN;
    process.env.APP_TRUSTED_CLIENT_IP = '1';
    process.env.SESSION_SECRET = SECRET;
    process.env.APP_ALLOWED_HOSTS = 'tracker.example.com';
    const state = getAuthState();
    state.loaded = true;
    state.versions = { admin: 1 };
    state.revoked = new Set();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const session = () => signSession({ sid: 'abc', uid: 'admin', v: 1, exp: Math.floor(Date.now() / 1000) + 3600, k: 'web' }, SECRET);

  it('ignores IP trust and the app token: API without a session is 401', () => {
    expect(proxy(makeRequest('/api/applications', { headers: tunnel })).status).toBe(401);
    expect(proxy(makeRequest('/api/applications', { headers: { ...tunnel, cookie: `app_token=${TOKEN}` } })).status).toBe(401);
    expect(proxy(makeRequest(`/api/applications?token=${TOKEN}`, { headers: tunnel })).status).toBe(401);
  });

  it('redirects pages to /login with the original path', () => {
    const response = proxy(makeRequest('/settings', { headers: tunnel }));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login?next=%2Fsettings');
  });

  it('leaves the login page and login API open', () => {
    expect(proxy(makeRequest('/login', { headers: tunnel })).status).toBe(200);
    expect(proxy(makeRequest('/api/auth/login', { method: 'POST', headers: { ...tunnel, origin: 'http://localhost:3000' } })).status).toBe(200);
  });

  it('accepts a valid session cookie or Bearer token', () => {
    expect(proxy(makeRequest('/api/applications', { headers: { ...tunnel, cookie: `mg_session=${session()}` } })).status).toBe(200);
    expect(proxy(makeRequest('/api/applications', { headers: { ...tunnel, authorization: `Bearer ${session()}` } })).status).toBe(200);
  });

  it('rejects a revoked session', () => {
    getAuthState().revoked.add('abc');
    expect(proxy(makeRequest('/api/applications', { headers: { ...tunnel, cookie: `mg_session=${session()}` } })).status).toBe(401);
  });

  it('treats the public domain as public even without the tunnel flag', () => {
    expect(proxy(makeRequest('/api/applications', { headers: { host: 'tracker.example.com', 'x-forwarded-for': '127.0.0.1' } })).status).toBe(401);
  });

  it('still blocks cross-site POSTs from the internet', () => {
    expect(proxy(makeRequest('/api/auth/login', { method: 'POST', headers: { ...tunnel, origin: 'https://evil.example' } })).status).toBe(403);
  });

  it('keeps LAN requests password-free', () => {
    expect(proxy(makeRequest('/api/applications', { headers: { 'x-forwarded-for': '192.168.1.20' } })).status).toBe(200);
  });
});
