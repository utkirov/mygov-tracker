import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createBackup, decryptBackup, encryptBackup, selectBackupsToDelete } from '../backup';
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
});
