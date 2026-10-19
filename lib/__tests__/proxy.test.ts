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
