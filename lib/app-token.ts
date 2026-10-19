import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

import { resolveLocalProjectRoot } from './local-paths';

function getEnvFilePath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), '.env.local');
}

/**
 * Ensures process.env.APP_TOKEN is set, generating and persisting one to
 * .env.local (gitignored via `.env*`) the first time the server boots.
 * Safe to call more than once per process — a subsequent call reuses the
 * value already on process.env, and never appends a duplicate line.
 */
export function ensureAppToken(rootPath?: string): string {
  const existingEnvValue = process.env.APP_TOKEN?.trim();
  if (existingEnvValue) {
    return existingEnvValue;
  }

  const envFilePath = getEnvFilePath(rootPath);
  const existingContents = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : '';
  const existingLine = existingContents.match(/^APP_TOKEN=(.*)$/m);

  // Reuse whatever is already persisted on disk (e.g. from a previous server boot)
  // instead of regenerating — otherwise a restarted process would end up with a
  // token that no longer matches the value background-server.mjs read from the file.
  const token = existingLine ? existingLine[1].trim() : randomUUID();

  if (!existingLine) {
    const prefix = existingContents.length > 0 && !existingContents.endsWith('\n') ? '\n' : '';
    appendFileSync(envFilePath, `${prefix}APP_TOKEN=${token}\n`, 'utf8');
  }

  process.env.APP_TOKEN = token;
  return token;
}

/** Reads the token set by ensureAppToken(). Throws if it hasn't been called yet. */
export function getAppToken(): string {
  const token = process.env.APP_TOKEN;
  if (!token) {
    throw new Error('APP_TOKEN is not set — ensureAppToken() must run before getAppToken() is called');
  }
  return token;
}

/**
 * True for loopback and private-LAN addresses (RFC 1918 IPv4, IPv6 loopback,
 * link-local and unique-local, plus IPv4-mapped IPv6 forms of those). Requests
 * from these are trusted without a token — the app is meant to be used from
 * devices on the same home/office network.
 */
export function isPrivateNetworkAddress(ip: string | undefined | null): boolean {
  if (!ip) return false;
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith('[') && addr.endsWith(']')) addr = addr.slice(1, -1);
  if (addr.startsWith('::ffff:')) addr = addr.slice('::ffff:'.length);

  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }

  if (addr === '::1') return true;
  return /^fe[89ab][0-9a-f]:/.test(addr) || /^f[cd][0-9a-f]{2}:/.test(addr);
}

/**
 * True if either the cookie or the query-string token matches the expected
 * shared secret. Kept as a small pure function so it's testable without
 * needing to exercise the proxy/middleware runtime.
 */
export function isValidAppToken(
  cookieValue: string | undefined | null,
  queryValue: string | undefined | null,
  expected: string
): boolean {
  if (!expected) return false;
  return cookieValue === expected || queryValue === expected;
}
