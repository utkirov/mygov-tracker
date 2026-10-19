import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createSession,
  getUser,
  hashPassword,
  listSessions,
  loadAuthState,
  loginLockedFor,
  readSession,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginAttempts,
  revokeAllSessions,
  revokeSession,
  setPassword,
  validateNewPassword,
  verifyPassword,
} from '../auth';
import { getAuthState, signSession, verifySession, type AuthState } from '../session-token';
import { closeDb } from '../sqlite-db';

describe('passwords', () => {
  it('hashes with a random salt and verifies', () => {
    const a = hashPassword('correct horse battery');
    expect(a).not.toBe(hashPassword('correct horse battery'));
    expect(verifyPassword('correct horse battery', a)).toBe(true);
    expect(verifyPassword('wrong password!!', a)).toBe(false);
  });

  it('rejects short or trivial passwords', () => {
    expect(validateNewPassword('short')).not.toBeNull();
    expect(validateNewPassword('aaaaaaaaaaaa')).not.toBeNull();
    expect(validateNewPassword('long enough pass')).toBeNull();
  });
});

describe('verifySession', () => {
  const secret = 'test-secret';
  const state = (): AuthState => ({ loaded: true, versions: { admin: 2 }, revoked: new Set() });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = signSession({ sid: 's1', uid: 'admin', v: 2, exp, k: 'web' }, secret);

  it('accepts a valid token', () => {
    expect(verifySession(token, secret, state())?.sid).toBe('s1');
  });

  it('rejects a wrong secret, tampering, expiry, old version, revocation, unloaded state', () => {
    expect(verifySession(token, 'other', state())).toBeNull();
    expect(verifySession(token.slice(0, -2) + 'xx', secret, state())).toBeNull();
    expect(verifySession(signSession({ sid: 's1', uid: 'admin', v: 2, exp: 1, k: 'web' }, secret), secret, state())).toBeNull();
    expect(verifySession(signSession({ sid: 's1', uid: 'admin', v: 1, exp, k: 'web' }, secret), secret, state())).toBeNull();
    const revoked = state();
    revoked.revoked.add('s1');
    expect(verifySession(token, secret, revoked)).toBeNull();
    expect(verifySession(token, secret, { ...state(), loaded: false })).toBeNull();
    expect(verifySession(null, secret, state())).toBeNull();
  });
});

describe('login rate limit', () => {
  beforeEach(() => resetLoginAttempts());

  it('locks an address after 5 failures and unlocks after 15 minutes', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(recordLoginFailure('1.2.3.4', t + i)).toBe(false);
    expect(recordLoginFailure('1.2.3.4', t + 5)).toBe(true);
    expect(loginLockedFor('1.2.3.4', t + 10)).toBeGreaterThan(0);
    expect(loginLockedFor('5.6.7.8', t + 10)).toBe(0);
    expect(loginLockedFor('1.2.3.4', t + 16 * 60 * 1000)).toBe(0);
  });

  it('success clears the counter', () => {
    for (let i = 0; i < 4; i++) recordLoginFailure('1.1.1.1');
    recordLoginSuccess('1.1.1.1');
    expect(recordLoginFailure('1.1.1.1')).toBe(false);
  });
});

describe('accounts and sessions', () => {
  let root: string;
  const env = { ...process.env };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mygov-auth-'));
    process.env.SESSION_SECRET = 'unit-test-secret';
    closeDb();
    getAuthState().loaded = false;
  });

  afterEach(async () => {
    closeDb();
    process.env = { ...env };
    await rm(root, { recursive: true, force: true });
  });

  it('creates the user, issues sessions, revokes one and all', async () => {
    await loadAuthState(root);
    expect(await getUser(root)).toBeNull();

    await setPassword('admin', 'first password 1', root);
    const user = await getUser(root);
    expect(user && verifyPassword('first password 1', user.password_hash)).toBe(true);

    const a = await createSession({ username: 'admin', kind: 'web', remember: true }, root);
    const b = await createSession({ username: 'admin', kind: 'device', deviceName: 'Pixel' }, root);
    expect(readSession(a.token)?.uid).toBe('admin');
    expect(readSession(b.token)?.k).toBe('device');
    expect((await listSessions('admin', root)).length).toBe(2);

    await revokeSession(a.sid, root);
    expect(readSession(a.token)).toBeNull();
    expect(readSession(b.token)).not.toBeNull();

    await revokeAllSessions('admin', root);
    expect(readSession(b.token)).toBeNull();
    expect(await listSessions('admin', root)).toEqual([]);
  });

  it('changing the password logs out existing sessions', async () => {
    await setPassword('admin', 'first password 1', root);
    const s = await createSession({ username: 'admin', kind: 'web' }, root);
    await setPassword('admin', 'second password 2', root);
    expect(readSession(s.token)).toBeNull();
    const user = await getUser(root);
    expect(user && verifyPassword('second password 2', user.password_hash)).toBe(true);
  });
});
