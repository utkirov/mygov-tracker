import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_PUSH_PREFS,
  getPushPrefs,
  isDeadTokenResponse,
  isPushConfigured,
  listActivePushTargets,
  listActivePushTokens,
  normalizePushPrefs,
  pushChannel,
  registerPushDevice,
  sendPushToAll,
  setPushPrefs,
  shouldDeliver,
  unregisterPushDevice,
} from '../push';
import { closeDb, openDb } from '../sqlite-db';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mygov-push-'));
  closeDb();
});
afterEach(async () => {
  closeDb();
  await rm(root, { recursive: true, force: true });
});

async function addSession(id: string, opts: { revoked?: boolean; expired?: boolean } = {}) {
  const db = await openDb(root);
  const now = Date.now();
  db.prepare(`INSERT INTO auth_sessions (id, username, kind, created_at, expires_at, revoked_at) VALUES (?, 'admin', 'device', ?, ?, ?)`)
    .run(id, new Date(now).toISOString(), new Date(now + (opts.expired ? -1000 : 86_400_000)).toISOString(), opts.revoked ? new Date(now).toISOString() : null);
}

const tok = (n: string) => `fcm-token-${n}-${'x'.repeat(20)}`;

describe('push devices', () => {
  it('only targets phones whose login session is still valid', async () => {
    await addSession('live');
    await addSession('revoked', { revoked: true });
    await addSession('expired', { expired: true });
    await registerPushDevice({ token: tok('a'), sessionId: 'live' }, root);
    await registerPushDevice({ token: tok('b'), sessionId: 'revoked' }, root);
    await registerPushDevice({ token: tok('c'), sessionId: 'expired' }, root);
    expect(await listActivePushTokens(root)).toEqual([tok('a')]);
  });

  it('re-registering a token moves it to the new session; unregister removes it', async () => {
    await addSession('old', { revoked: true });
    await addSession('new');
    await registerPushDevice({ token: tok('a'), sessionId: 'old' }, root);
    await registerPushDevice({ token: tok('a'), sessionId: 'new' }, root);
    expect(await listActivePushTokens(root)).toEqual([tok('a')]);
    await unregisterPushDevice(tok('a'), root);
    expect(await listActivePushTokens(root)).toEqual([]);
  });

  it('is off without a Firebase service account', async () => {
    expect(isPushConfigured(root)).toBe(false);
    expect(await sendPushToAll({ title: 't', body: 'b' }, root)).toBe(0);
  });

  it('stores per-phone preferences only for the owning session', async () => {
    await addSession('s1');
    await registerPushDevice({ token: tok('a'), sessionId: 's1' }, root);
    expect(await getPushPrefs(tok('a'), 's1', root)).toEqual(DEFAULT_PUSH_PREFS);
    expect(await setPushPrefs(tok('a'), 'other', { cycle: true }, root)).toBeNull();
    const saved = await setPushPrefs(tok('a'), 's1', { cycle: true, quiet: { enabled: true, from: '22:00', to: 'bad' } }, root);
    expect(saved).toEqual({ ...DEFAULT_PUSH_PREFS, cycle: true, quiet: { enabled: true, from: '22:00', to: '08:00' } });
    expect((await listActivePushTargets(root))[0].prefs.cycle).toBe(true);
  });

  it('recognises tokens FCM has dropped', () => {
    expect(isDeadTokenResponse(404, '{"error":{"status":"NOT_FOUND"}}')).toBe(true);
    expect(isDeadTokenResponse(400, '{"details":[{"errorCode":"UNREGISTERED"}]}')).toBe(true);
    expect(isDeadTokenResponse(500, 'internal')).toBe(false);
  });
});

describe('shouldDeliver', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 20, h, m);
  const quiet = normalizePushPrefs({ quiet: { enabled: true, from: '23:00', to: '08:00' } });

  it('respects the per-kind switches', () => {
    expect(shouldDeliver(DEFAULT_PUSH_PREFS, 'status-change', false, at(12))).toBe(true);
    expect(shouldDeliver(DEFAULT_PUSH_PREFS, 'cycle', false, at(12))).toBe(false);
    expect(shouldDeliver(normalizePushPrefs({ errors: false }), 'error', true, at(12))).toBe(false);
  });

  it('holds back non-urgent pushes during quiet hours that cross midnight', () => {
    expect(shouldDeliver(quiet, 'status-change', false, at(23, 30))).toBe(false);
    expect(shouldDeliver(quiet, 'status-change', false, at(3))).toBe(false);
    expect(shouldDeliver(quiet, 'status-change', false, at(8))).toBe(true);
    expect(shouldDeliver(quiet, 'status-change', true, at(3))).toBe(true);
  });
});

describe('pushChannel', () => {
  it('picks the vibration channel by urgency', () => {
    expect(pushChannel('status-change', true)).toBe('status-urgent');
    expect(pushChannel('error', false)).toBe('status-alerts');
    expect(pushChannel('cycle', true)).toBe('cycle-summary');
  });
});
