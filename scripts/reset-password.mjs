// Emergency password reset, run on the tracker PC itself:
//   node scripts/reset-password.mjs [username]
// Asks for the new password, logs out every device, then restart the server
// (it caches session versions in memory).
import { randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const username = process.argv[2] || 'admin';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question(`Новый пароль для «${username}» (от 10 символов): `);
rl.close();
if (password.length < 10) {
  console.error('Пароль слишком короткий.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = `scrypt$16384$8$1$${salt.toString('base64')}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
const now = new Date().toISOString();
const db = new Database(join(projectDir, 'data', 'local-db.sqlite'));
db.prepare(`
  INSERT INTO auth_users (username, password_hash, session_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)
  ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, session_version = session_version + 1, updated_at = excluded.updated_at
`).run(username, hash, now, now);
db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE username = ? AND revoked_at IS NULL').run(now, username);
db.close();
console.log('Пароль изменён, все устройства вышли. Перезапустите сервер трекера.');
