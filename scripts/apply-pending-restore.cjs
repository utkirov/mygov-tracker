// Second half of Settings → «Восстановить…» (lib/backup.ts stageRestore()).
// The running server can't swap its own SQLite file — several bundles hold
// open handles — so the restore is staged in data/restore-pending/ and the
// server exits. server.mjs calls this before Next.js (and the database) starts.
const { existsSync, mkdirSync, readFileSync, renameSync, rmSync } = require('node:fs');
const path = require('node:path');

const SAFE_NAME = /^(local-db\.sqlite|pdfs\/[\w.-]+\.pdf|artifacts\/[\w-]{1,64}\/(result-\d{1,2}\.pdf|meta\.json))$/;

/** Returns the number of files moved into place, or 0 when nothing was pending. */
function applyPendingRestore(dataDir, log = console.log) {
  const pendingDir = path.join(dataDir, 'restore-pending');
  const manifestPath = path.join(pendingDir, 'manifest.json');
  if (!existsSync(pendingDir)) return 0;
  if (!existsSync(manifestPath)) {
    // Interrupted while staging — the live data was never touched, just drop it.
    rmSync(pendingDir, { recursive: true, force: true });
    return 0;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const names = Array.isArray(manifest.files) ? manifest.files : [];
  if (!names.includes('local-db.sqlite') || names.some((n) => typeof n !== 'string' || !SAFE_NAME.test(n))) {
    log(`[restore] pending restore of ${manifest.backup} looks invalid — ignored`);
    rmSync(pendingDir, { recursive: true, force: true });
    return 0;
  }

  for (const suffix of ['-wal', '-shm']) rmSync(path.join(dataDir, `local-db.sqlite${suffix}`), { force: true });
  for (const name of names) {
    const from = path.join(pendingDir, ...name.split('/'));
    const to = path.join(dataDir, ...name.split('/'));
    mkdirSync(path.dirname(to), { recursive: true });
    rmSync(to, { force: true });
    renameSync(from, to);
  }
  rmSync(pendingDir, { recursive: true, force: true });
  log(`[restore] restored ${names.length} files from ${manifest.backup} (previous state saved as ${manifest.safetyBackup})`);
  return names.length;
}

module.exports = { applyPendingRestore, SAFE_NAME };
