import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { acquireProcessLock, releaseProcessLock } from '../process-lock';
import { getApplicationById, listApplications, pruneCheckLog, readSettings } from '../local-db';
import { closeDb, openDb } from '../sqlite-db';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRotatingLog, nextRestartDelay } = require('../../scripts/rotating-log.cjs');

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mygov-maint-'));
  closeDb();
});
afterEach(async () => {
  closeDb();
  await rm(root, { recursive: true, force: true });
});

describe('process lock', () => {
  it('blocks a second live holder and frees stale locks', () => {
    const file = path.join(root, 'bot.lock');
    expect(acquireProcessLock(file, 100, () => true)).toEqual({ ok: true });
    expect(acquireProcessLock(file, 200, () => true)).toEqual({ ok: false, holder: 100 });
    expect(acquireProcessLock(file, 200, () => false)).toEqual({ ok: true });
    releaseProcessLock(file, 200);
    expect(acquireProcessLock(file, 300, () => true)).toEqual({ ok: true });
  });
});

describe('rotating log', () => {
  it('rotates by size and keeps a fixed number of files', async () => {
    const file = path.join(root, 'server.log');
    const log = createRotatingLog(file, { maxBytes: 100, keep: 2 });
    for (let i = 0; i < 10; i++) log.write('x'.repeat(60) + '\n');
    const files = (await readdir(root)).filter((n: string) => n.startsWith('server.log')).sort();
    expect(files).toEqual(['server.log', 'server.log.1', 'server.log.2']);
    expect((await readFile(file)).length).toBeLessThanOrEqual(100);
  });

  it('backs off restarts', () => {
    expect(nextRestartDelay(0)).toBe(2000);
    expect(nextRestartDelay(10)).toBe(60000);
  });
});

describe('targeted reads and check_log pruning', () => {
  it('reads settings / applications without the full snapshot and prunes old log rows', async () => {
    const db = await openDb(root);
    const now = new Date('2026-10-20T00:00:00Z');
    const ins = db.prepare(`INSERT INTO applications (id, application_number, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
    ins.run('a1', '111', 0, '2026-01-01', '2026-01-01');
    ins.run('a2', '222', 1, '2026-01-02', '2026-01-02');
    const log = db.prepare(`INSERT INTO check_log (id, application_id, checked_at, result) VALUES (?, 'a1', ?, ?)`);
    log.run('old-unchanged', '2026-08-01T00:00:00Z', 'unchanged');
    log.run('recent-unchanged', '2026-10-10T00:00:00Z', 'unchanged');
    log.run('old-changed', '2026-08-01T00:00:00Z', 'changed');
    log.run('ancient-error', '2026-01-01T00:00:00Z', 'error');

    expect((await listApplications({ archived: false }, root)).map((a) => a.id)).toEqual(['a1']);
    expect((await getApplicationById('a2', root))?.archived).toBe(true);
    expect(await getApplicationById('nope', root)).toBeNull();
    expect((await readSettings(root)).auto_check).toBeDefined();

    expect(await pruneCheckLog(now, root)).toBe(2);
    const left = (db.prepare('SELECT id FROM check_log ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    expect(left).toEqual(['old-changed', 'recent-unchanged']);

    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM check_log ORDER BY checked_at DESC LIMIT 50").all() as { detail: string }[];
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/idx_check_log_checked_at/);
  });
});
