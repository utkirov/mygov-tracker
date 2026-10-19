// Restores a ".mgbk" backup made by lib/backup.ts into a separate folder.
// It never touches the live data/ folder — copy the files over yourself after
// stopping the server.
//
// Usage: node scripts/restore-backup.mjs <backup.mgbk> [output-dir]
// The key is read from BACKUP_KEY (env) or from .env.local next to this project.
import { createDecipheriv, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const [, , input, outArg] = process.argv;

if (!input) {
  console.error('Usage: node scripts/restore-backup.mjs <backup.mgbk> [output-dir]');
  process.exit(1);
}

function readKey() {
  let hex = process.env.BACKUP_KEY?.trim();
  const envPath = join(projectDir, '.env.local');
  if (!hex && existsSync(envPath)) hex = readFileSync(envPath, 'utf8').match(/^BACKUP_KEY=(.*)$/m)?.[1].trim();
  if (!hex) throw new Error('BACKUP_KEY not found (set the env var or put it into .env.local)');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 64 hex characters');
  return key;
}

const blob = readFileSync(input);
if (blob.subarray(0, 8).toString('ascii') !== 'MGBKENC1') throw new Error('Not a my.gov tracker backup file');
const decipher = createDecipheriv('aes-256-gcm', readKey(), blob.subarray(8, 20));
decipher.setAuthTag(blob.subarray(20, 36));
const container = gunzipSync(Buffer.concat([decipher.update(blob.subarray(36)), decipher.final()]));

const headerLength = container.readUInt32BE(0);
const header = JSON.parse(container.subarray(4, 4 + headerLength).toString('utf8'));
const outDir = resolve(outArg ?? join(projectDir, 'data', `restore-${header.createdAt.replace(/[:.]/g, '-')}`));

let offset = 4 + headerLength;
for (const entry of header.files) {
  const data = container.subarray(offset, offset + entry.size);
  offset += entry.size;
  if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.name}`);
  const target = join(outDir, entry.name);
  if (!target.startsWith(outDir)) throw new Error(`Unsafe path in backup: ${entry.name}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

console.log(`Restored ${header.files.length} files from backup of ${header.createdAt}`);
console.log(`Output: ${outDir}`);
console.log('To use it: stop the server, then copy local-db.sqlite into data/ (delete data/local-db.sqlite-wal and -shm) and pdfs/* into data/pdfs/.');
