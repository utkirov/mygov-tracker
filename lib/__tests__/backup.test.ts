import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createBackup, decryptBackup, encryptBackup, listBackups, selectBackupsToDelete, stageRestore } from '../backup';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CommonJS helper shared with server.mjs
const { applyPendingRestore } = require('../../scripts/apply-pending-restore.cjs') as { applyPendingRestore: (dataDir: string, log?: (m: string) => void) => number };
import { readLocalDb, writeLocalDb } from '../local-db';
import { closeDb } from '../sqlite-db';

describe('encryptBackup / decryptBackup', () => {
  const key = randomBytes(32);
  const files = [
    { name: 'local-db.sqlite', data: Buffer.from('sqlite bytes') },
    { name: 'pdfs/a.pdf', data: Buffer.from('%PDF-1.4 a') },
  ];

  it('round-trips files and metadata', () => {
    const { header, files: out } = decryptBackup(encryptBackup(files, key, new Date('2026-10-20T03:00:00Z')), key);
    expect(header.createdAt).toBe('2026-10-20T03:00:00.000Z');
    expect(out.map((f) => [f.name, f.data.toString()])).toEqual(files.map((f) => [f.name, f.data.toString()]));
  });

  it('does not contain plaintext', () => {
    expect(encryptBackup(files, key).includes(Buffer.from('%PDF-1.4'))).toBe(false);
  });

  it('rejects a wrong key', () => {
    expect(() => decryptBackup(encryptBackup(files, key), randomBytes(32))).toThrow();
  });

  it('rejects a tampered file', () => {
    const blob = encryptBackup(files, key);
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptBackup(blob, key)).toThrow();
  });
});

describe('selectBackupsToDelete', () => {
  const name = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `mygov-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.mgbk`;
  };

  it('keeps the newest copy of each of the last 14 days and 8 older weeks', () => {
    const names: string[] = [];
    const start = new Date(2026, 9, 20, 3, 0);
    for (let i = 0; i < 120; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() - i);
      names.push(name(d));
    }
    // an extra manual copy on the newest day
    names.push(name(new Date(2026, 9, 20, 15, 30)));

    const toDelete = new Set(selectBackupsToDelete(names));
    const kept = names.filter((n) => !toDelete.has(n));

    expect(kept).toContain(name(new Date(2026, 9, 20, 15, 30)));
    expect(kept).not.toContain(name(start));
    expect(kept.length).toBe(14 + 8);
  });

  it('ignores files that are not backups', () => {
    expect(selectBackupsToDelete(['notes.txt', 'mygov-backup-x.mgbk'])).toEqual([]);
  });
});

describe('createBackup', () => {
  let root: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mygov-backup-'));
    process.env.BACKUP_KEY = randomBytes(32).toString('hex');
    process.env.BACKUP_DIR = path.join(root, 'out');
    closeDb();
  });

  afterEach(async () => {
    closeDb();
    process.env = { ...originalEnv };
    await rm(root, { recursive: true, force: true });
  });

  it('writes an encrypted backup with the database and PDFs and records status', async () => {
    const db = await readLocalDb(root);
    db.settings.telegram.chat_id = 'marker-chat';
    await writeLocalDb(db, root);
    await mkdir(path.join(root, 'data', 'pdfs'), { recursive: true });
    await writeFile(path.join(root, 'data', 'pdfs', '1-x.pdf'), '%PDF-1.4 test');

    const status = await createBackup(root);
    expect(status.lastError).toBeNull();
    expect(status.lastFile).toMatch(/^mygov-backup-.*\.mgbk$/);

    const outFiles = await readdir(path.join(root, 'out'));
    expect(outFiles).toEqual([status.lastFile]);

    const { files } = decryptBackup(await readFile(path.join(root, 'out', status.lastFile!)), Buffer.from(process.env.BACKUP_KEY!, 'hex'));
    expect(files.map((f) => f.name)).toEqual(['local-db.sqlite', 'pdfs/1-x.pdf']);
    expect(files[0].data.subarray(0, 15).toString()).toBe('SQLite format 3');
    expect(files[0].data.includes(Buffer.from('marker-chat'))).toBe(true);

    const saved = JSON.parse(await readFile(path.join(root, 'data', 'backup-status.json'), 'utf8'));
    expect(saved.lastFile).toBe(status.lastFile);
  });

  it('restores a backup and keeps a safety copy of the replaced state', async () => {
    const db = await readLocalDb(root);
    db.settings.telegram.chat_id = 'before';
    await writeLocalDb(db, root);
    await mkdir(path.join(root, 'data', 'pdfs'), { recursive: true });
    await writeFile(path.join(root, 'data', 'pdfs', '1-x.pdf'), '%PDF-1.4 original');
    const original = await createBackup(root);

    const changed = await readLocalDb(root);
    changed.settings.telegram.chat_id = 'after';
    await writeLocalDb(changed, root);
    await writeFile(path.join(root, 'data', 'pdfs', '1-x.pdf'), '%PDF-1.4 edited');

    const result = await stageRestore(original.lastFile!, root);
    expect(result.safetyBackup).not.toBe(original.lastFile);
    // Nothing live changes until the server restarts.
    expect(await readFile(path.join(root, 'data', 'pdfs', '1-x.pdf'), 'utf8')).toBe('%PDF-1.4 edited');

    closeDb();
    expect(applyPendingRestore(path.join(root, 'data'), () => {})).toBe(2);
    expect(applyPendingRestore(path.join(root, 'data'), () => {})).toBe(0);
    expect((await listBackups(root)).map((b) => b.name).sort()).toEqual([original.lastFile, result.safetyBackup].sort());

    expect((await readLocalDb(root)).settings.telegram.chat_id).toBe('before');
    expect(await readFile(path.join(root, 'data', 'pdfs', '1-x.pdf'), 'utf8')).toBe('%PDF-1.4 original');
  });

  it('refuses names outside the backup folder', async () => {
    await expect(stageRestore('../local-db.sqlite', root)).rejects.toThrow();
    await expect(stageRestore('mygov-backup-x/../../y.mgbk', root)).rejects.toThrow();
  });
});
