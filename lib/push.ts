import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveLocalProjectRoot } from './local-paths';
import { openDb } from './sqlite-db';

/**
 * Push notifications to the Android app through Firebase Cloud Messaging
 * (HTTP v1 API). Every device token belongs to a login session, so revoking
 * the session (logout, password change) silences that phone too.
 *
 * Needs data/firebase-service-account.json (never committed). Without it
 * push is simply off and everything else keeps working.
 */

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

/** What a push is about — each phone chooses which kinds it wants (app Settings, design A7). */
export type PushKind = 'status-change' | 'completed' | 'error' | 'cycle';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  kind?: PushKind;
  /** Delivered even during quiet hours (the applicant must act, or a result arrived). */
  urgent?: boolean;
}

export interface PushPrefs {
  status: boolean;
  errors: boolean;
  completed: boolean;
  cycle: boolean;
  quiet: { enabled: boolean; from: string; to: string };
}

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  status: true,
  errors: true,
  completed: true,
  cycle: false,
  quiet: { enabled: false, from: '23:00', to: '08:00' },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizePushPrefs(input: unknown): PushPrefs {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<PushPrefs>;
  const quiet = (raw.quiet && typeof raw.quiet === 'object' ? raw.quiet : {}) as Partial<PushPrefs['quiet']>;
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    status: bool(raw.status, DEFAULT_PUSH_PREFS.status),
    errors: bool(raw.errors, DEFAULT_PUSH_PREFS.errors),
    completed: bool(raw.completed, DEFAULT_PUSH_PREFS.completed),
    cycle: bool(raw.cycle, DEFAULT_PUSH_PREFS.cycle),
    quiet: {
      enabled: bool(quiet.enabled, DEFAULT_PUSH_PREFS.quiet.enabled),
      from: typeof quiet.from === 'string' && TIME_RE.test(quiet.from) ? quiet.from : DEFAULT_PUSH_PREFS.quiet.from,
      to: typeof quiet.to === 'string' && TIME_RE.test(quiet.to) ? quiet.to : DEFAULT_PUSH_PREFS.quiet.to,
    },
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Whether a phone with these preferences should get this push right now (server local time). */
export function shouldDeliver(prefs: PushPrefs, kind: PushKind, urgent: boolean, now = new Date()): boolean {
  const wanted = kind === 'status-change' ? prefs.status
    : kind === 'completed' ? prefs.completed
      : kind === 'error' ? prefs.errors
        : prefs.cycle;
  if (!wanted) return false;
  if (!prefs.quiet.enabled || urgent) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutesOf(prefs.quiet.from);
  const to = minutesOf(prefs.quiet.to);
  const inQuiet = from <= to ? current >= from && current < to : current >= from || current < to;
  return !inQuiet;
}

export function serviceAccountPath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'firebase-service-account.json');
}

function readServiceAccount(rootPath?: string): ServiceAccount | null {
  const file = serviceAccountPath(rootPath);
  if (!existsSync(file)) return null;
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceAccount>;
    if (!json.project_id || !json.client_email || !json.private_key) return null;
    return json as ServiceAccount;
  } catch {
    return null;
  }
}

export function isPushConfigured(rootPath?: string): boolean {
  return readServiceAccount(rootPath) !== null;
}

// ── devices ────────────────────────────────────────────────────────────────

export async function registerPushDevice(opts: { token: string; sessionId: string; platform?: string; deviceName?: string }, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO push_devices (token, session_id, platform, device_name, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET session_id = excluded.session_id, platform = excluded.platform,
      device_name = excluded.device_name, last_seen_at = excluded.last_seen_at`)
    .run(opts.token, opts.sessionId, (opts.platform ?? 'android').slice(0, 20), (opts.deviceName ?? '').slice(0, 80), now, now);
}

export async function unregisterPushDevice(token: string, rootPath?: string): Promise<void> {
  const db = await openDb(rootPath);
  db.prepare('DELETE FROM push_devices WHERE token = ?').run(token);
}

/** Phones whose login session is still valid, with their notification preferences. */
export async function listActivePushTargets(rootPath?: string): Promise<Array<{ token: string; prefs: PushPrefs }>> {
  const db = await openDb(rootPath);
  const rows = db.prepare(`SELECT d.token, d.prefs FROM push_devices d
    JOIN auth_sessions s ON s.id = d.session_id
    WHERE s.revoked_at IS NULL AND s.expires_at > ?`).all(new Date().toISOString()) as Array<{ token: string; prefs: string }>;
  return rows.map(r => {
    let parsed: unknown = null;
    try { parsed = r.prefs ? JSON.parse(r.prefs) : null; } catch { parsed = null; }
    return { token: r.token, prefs: normalizePushPrefs(parsed) };
  });
}

/** Tokens whose login session is still valid. */
export async function listActivePushTokens(rootPath?: string): Promise<string[]> {
  return (await listActivePushTargets(rootPath)).map(t => t.token);
}

/** Preferences of one phone, only if the token belongs to the given session. */
export async function getPushPrefs(token: string, sessionId: string, rootPath?: string): Promise<PushPrefs | null> {
  const db = await openDb(rootPath);
  const row = db.prepare('SELECT prefs FROM push_devices WHERE token = ? AND session_id = ?').get(token, sessionId) as { prefs: string } | undefined;
  if (!row) return null;
  let parsed: unknown = null;
  try { parsed = row.prefs ? JSON.parse(row.prefs) : null; } catch { parsed = null; }
  return normalizePushPrefs(parsed);
}

export async function setPushPrefs(token: string, sessionId: string, prefs: unknown, rootPath?: string): Promise<PushPrefs | null> {
  const db = await openDb(rootPath);
  const normalized = normalizePushPrefs(prefs);
  const result = db.prepare('UPDATE push_devices SET prefs = ? WHERE token = ? AND session_id = ?').run(JSON.stringify(normalized), token, sessionId);
  return result.changes > 0 ? normalized : null;
}

// ── FCM ────────────────────────────────────────────────────────────────────

let cachedAccessToken: { token: string; expiresAt: number; email: string } | null = null;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.email === account.client_email && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${base64url(signer.sign(account.private_key))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = await response.json() as { access_token: string; expires_in: number };
  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000, email: account.client_email };
  return json.access_token;
}

/** FCM says the token is gone for good — the app was uninstalled or reset. */
export function isDeadTokenResponse(status: number, body: string): boolean {
  return status === 404 || (status === 400 && body.includes('INVALID_ARGUMENT') && body.includes('registration token')) || body.includes('UNREGISTERED');
}

/** Sends to every logged-in phone. Returns how many deliveries FCM accepted. */
export async function sendPushToAll(message: PushMessage, rootPath?: string): Promise<number> {
  const account = readServiceAccount(rootPath);
  if (!account) return 0;
  const kind = message.kind ?? 'status-change';
  const now = new Date();
  const tokens = (await listActivePushTargets(rootPath))
    .filter(t => shouldDeliver(t.prefs, kind, message.urgent === true, now))
    .map(t => t.token);
  if (tokens.length === 0) return 0;

  const accessToken = await getAccessToken(account);
  const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
  let sent = 0;
  await Promise.all(tokens.map(async (token) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Data-only: the app's expo-notifications builds the notification itself,
        // which is what lets it add the «Открыть / Скриншот / Прочитано» buttons
        // (categoryId) — FCM-rendered notifications can't carry them.
        message: {
          token,
          data: {
            title: message.title,
            message: message.body,
            body: JSON.stringify({ ...(message.data ?? {}), kind }),
            categoryId: kind === 'cycle' ? '' : 'application',
            channelId: 'status-changes',
          },
          android: { priority: 'high' },
        },
      }),
    });
    if (response.ok) { sent++; return; }
    const body = await response.text();
    if (isDeadTokenResponse(response.status, body)) {
      await unregisterPushDevice(token, rootPath);
    } else {
      console.error(`[Push] FCM ${response.status}: ${body.slice(0, 200)}`);
    }
  }));
  return sent;
}
