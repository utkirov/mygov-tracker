import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ensureAppToken, getAppToken, isPrivateNetworkAddress, isValidAppToken } from '../app-token';

describe('isPrivateNetworkAddress', () => {
  it.each([
    '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.6',
    '::1', '::ffff:192.168.1.20', '[::1]', 'fe80::1', 'fd12:3456::1',
  ])('accepts %s', ip => {
    expect(isPrivateNetworkAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '::ffff:8.8.8.8',
    '2001:db8::1', '', null, undefined, 'not-an-ip',
  ])('rejects %s', ip => {
    expect(isPrivateNetworkAddress(ip)).toBe(false);
  });
});

describe('isValidAppToken', () => {
  it('matches when the cookie value equals the expected token', () => {
    expect(isValidAppToken('secret', null, 'secret')).toBe(true);
  });

  it('matches when the query value equals the expected token', () => {
    expect(isValidAppToken(null, 'secret', 'secret')).toBe(true);
  });

  it('rejects when neither cookie nor query match', () => {
    expect(isValidAppToken('wrong', 'also-wrong', 'secret')).toBe(false);
  });

  it('rejects when both are missing', () => {
    expect(isValidAppToken(null, null, 'secret')).toBe(false);
  });

  it('rejects when the expected token is empty', () => {
    expect(isValidAppToken('', '', '')).toBe(false);
  });
});

describe('ensureAppToken / getAppToken', () => {
  let rootPath: string;
  const originalToken = process.env.APP_TOKEN;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'app-token-test-'));
    delete process.env.APP_TOKEN;
  });

  afterEach(async () => {
    if (originalToken === undefined) {
      delete process.env.APP_TOKEN;
    } else {
      process.env.APP_TOKEN = originalToken;
    }
    await rm(rootPath, { recursive: true, force: true });
  });

  it('generates a token, persists it to .env.local, and sets process.env', async () => {
    const token = ensureAppToken(rootPath);

    expect(token).toBeTruthy();
    expect(process.env.APP_TOKEN).toBe(token);
    expect(getAppToken()).toBe(token);

    const envContents = await readFile(path.join(rootPath, '.env.local'), 'utf8');
    expect(envContents).toContain(`APP_TOKEN=${token}`);
  });

  it('reuses the persisted token (no duplicate line, same value) across a fresh process', async () => {
    const first = ensureAppToken(rootPath);
    delete process.env.APP_TOKEN; // simulate a restart: fresh process, unset env var

    const second = ensureAppToken(rootPath);

    // Must reuse the value already on disk, not silently diverge from it.
    expect(second).toBe(first);

    const envContents = await readFile(path.join(rootPath, '.env.local'), 'utf8');
    const matches = envContents.match(/^APP_TOKEN=/gm) ?? [];
    expect(matches).toHaveLength(1);
    expect(envContents).toContain(`APP_TOKEN=${first}`);
  });
});
