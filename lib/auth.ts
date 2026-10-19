import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { readSettings } from './local-db';
import { resolveLocalProjectRoot } from './local-paths';
import { getAuthState, signSession, verifySession, type SessionPayload } from './session-token';
import { openDb } from './sqlite-db';
import { isTelegramConfigured, sendTelegramMessage } from './telegram';

export const MIN_PASSWORD_LENGTH = 10;
const WEB_REMEMBER_SECONDS = 90 * 24 * 60 * 60;
const WEB_SHORT_SECONDS = 12 * 60 * 60;
const DEVICE_SECONDS = 365 * 24 * 60 * 60;

// ── secret ────────────────────────────────────────────────────────────────

/** HMAC key for session tokens; generated once into .env.local like APP_TOKEN. */
export function ensureSessionSecret(rootPath?: string): string {
  const existing = process.env.SESSION_SECRET?.trim();
  if (existing) return existing;
  const file = path.join(resolveLocalProjectRoot(rootPath), '.env.local');
  const contents = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = contents.match(/^SESSION_SECRET=(.*)$/m);
  const value = line ? line[1].trim() : randomBytes(32).toString('hex');
  if (!line) {
    const prefix = contents.length > 0 && !contents.endsWith('\n') ? '\n' : '';
    appendFileSync(file, `${prefix}SESSION_SECRET=${value}\n`, 'utf8');
  }
  process.env.SESSION_SECRET = value;
  return value;
}

// ── passwords ─────────────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
  if (/^(.)\1+$/.test(password)) return 'Пароль слишком простой';
  return null;
}

// ── users & state ─────────────────────────────────────────────────────────

interface UserRow { username: string; password_hash: string; session_version: number }

export async function getUser(rootPath?: string): Promise<UserRow | null> {
  const db = await openDb(rootPath);
  return (db.prepare('SELECT username, password_hash, session_version FROM auth_users ORDER BY created_at LIMIT 1').get() as UserRow | undefined) ?? null;
}

/** Loads session versions and revoked session ids into the shared in-process state used by proxy.ts. */
export async function loadAuthState(rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  const state = getAuthState();
  state.versions = {};
  for (const u of db.prepare('SELECT username, session_version FROM auth_users').all() as UserRow[]) state.versions[u.username] = u.session_version;
  state.revoked = new Set(
    (db.prepare('SELECT id FROM auth_sessions WHERE revoked_at IS NOT NULL AND expires_at > ?').all(new Date().toISOString()) as { id: string }[]).map((r) => r.id)
  );
  state.loaded = true;
}

/** Creates the account or replaces its password. Bumps session_version so every existing session is logged out. */
export async function setPassword(username: string, password: string, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  const now = new Date().toISOString();
  const hash = hashPassword(password);
  db.prepare(`
    INSERT INTO auth_users (username, password_hash, session_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, session_version = session_version + 1, updated_at = excluded.updated_at
  `).run(username, hash, now, now);
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE username = ? AND revoked_at IS NULL').run(now, username);
  await loadAuthState(rootPath);
}

// ── sessions ──────────────────────────────────────────────────────────────

export interface NewSession { token: string; sid: string; expiresAt: Date; maxAgeSeconds: number }

export async function createSession(opts: { username: string; kind: 'web' | 'device'; remember?: boolean; deviceName?: string; ip?: string; userAgent?: string }, rootPath?: string): Promise<NewSession> {
  const secret = ensureSessionSecret(rootPath);
  const user = await getUser(rootPath);
  if (!user || user.username !== opts.username) throw new Error('Unknown user');
  const maxAgeSeconds = opts.kind === 'device' ? DEVICE_SECONDS : opts.remember ? WEB_REMEMBER_SECONDS : WEB_SHORT_SECONDS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000);
  const sid = randomUUID();
  const db = await openDb(rootPath);
  db.prepare(`INSERT INTO auth_sessions (id, username, kind, device_name, ip, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sid, user.username, opts.kind, (opts.deviceName ?? '').slice(0, 80), opts.ip ?? '', (opts.userAgent ?? '').slice(0, 300), now.toISOString(), expiresAt.toISOString());
  const payload: SessionPayload = { sid, uid: user.username, v: user.session_version, exp: Math.floor(expiresAt.getTime() / 1000), k: opts.kind };
  return { token: signSession(payload, secret), sid, expiresAt, maxAgeSeconds };
}

export function readSession(token: string | null | undefined): SessionPayload | null {
  return verifySession(token, process.env.SESSION_SECRET);
}

export async function revokeSession(sid: string, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), sid);
  getAuthState().revoked.add(sid);
}

export async function revokeAllSessions(username: string, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  const now = new Date().toISOString();
  db.prepare('UPDATE auth_users SET session_version = session_version + 1, updated_at = ? WHERE username = ?').run(now, username);
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE username = ? AND revoked_at IS NULL').run(now, username);
  await loadAuthState(rootPath);
}

export interface SessionInfo { id: string; kind: string; device_name: string; ip: string; user_agent: string; created_at: string; expires_at: string }

export async function listSessions(username: string, rootPath?: string): Promise<SessionInfo[]> {
  const db = await openDb(rootPath);
  return db.prepare(`SELECT id, kind, device_name, ip, user_agent, created_at, expires_at FROM auth_sessions
    WHERE username = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`).all(username, new Date().toISOString()) as SessionInfo[];
}

// ── brute-force protection ────────────────────────────────────────────────

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const GLOBAL_MAX_FAILURES = 30;

interface Attempts { count: number; first: number; lockedUntil: number }
const attempts = new Map<string, Attempts>();
let globalFailures: number[] = [];

export function loginLockedFor(ip: string, now = Date.now()): number {
  globalFailures = globalFailures.filter((t) => now - t < WINDOW_MS);
  if (globalFailures.length >= GLOBAL_MAX_FAILURES) return WINDOW_MS - (now - globalFailures[0]);
  const a = attempts.get(ip);
  return a && a.lockedUntil > now ? a.lockedUntil - now : 0;
}

/** Returns true when this failure just locked the address. */
export function recordLoginFailure(ip: string, now = Date.now()): boolean {
  globalFailures.push(now);
  const a = attempts.get(ip);
  if (!a || now - a.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now, lockedUntil: 0 });
    return false;
  }
  a.count++;
  if (a.count >= MAX_FAILURES) {
    a.lockedUntil = now + LOCK_MS;
    a.count = 0;
    a.first = now;
    return true;
  }
  return false;
}

export function recordLoginSuccess(ip: string): void {
  attempts.delete(ip);
}

export function resetLoginAttempts(): void {
  attempts.clear();
  globalFailures = [];
}

// ── notifications ─────────────────────────────────────────────────────────

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function describeUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /okhttp|Expo|ReactNative/i.test(ua) ? 'Приложение' : 'Браузер';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export async function notifySecurity(text: string): Promise<void> {
  try {
    const settings = await readSettings();
    if (isTelegramConfigured(settings)) await sendTelegramMessage(settings, esc(text));
  } catch (err) {
    console.error('[Auth] Telegram notify failed:', err);
  }
}
