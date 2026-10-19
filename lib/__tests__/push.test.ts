import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isDeadTokenResponse, isPushConfigured, listActivePushTokens, registerPushDevice, sendPushToAll, unregisterPushDevice } from '../push';
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

  it('recognises tokens FCM has dropped', () => {
    expect(isDeadTokenResponse(404, '{"error":{"status":"NOT_FOUND"}}')).toBe(true);
    expect(isDeadTokenResponse(400, '{"details":[{"errorCode":"UNREGISTERED"}]}')).toBe(true);
    expect(isDeadTokenResponse(500, 'internal')).toBe(false);
  });
});
