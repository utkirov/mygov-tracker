import { createWriteStream, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MANAGED_DIR_NAMES,
  MANAGED_FILE_NAMES,
  formatLanUrls,
  shouldRebuildFromHash,
} = require('./autostart-lib.cjs');

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBinPath = join(projectDir, 'node_modules', 'next', 'dist', 'bin', 'next');
// supervisor.mjs runs server.mjs (not `next start`, so clients can't spoof
// x-forwarded-for), restarts it on crash/hang and rotates logs/server.log.
const supervisorPath = join(projectDir, 'scripts', 'supervisor.mjs');
const buildMarkerPath = join(projectDir, '.next', 'BUILD_ID');
const buildStampPath = join(projectDir, 'data', 'build-stamp.txt');
const pidFilePath = join(projectDir, 'data', 'server.pid');
// supervisor.mjs keeps its own PID here and refuses to run twice.
const supervisorLockPath = join(projectDir, 'data', 'supervisor.pid');
// Only one launcher at a time: the logon task and the watchdog must never
// run `next build` concurrently.
const launcherLockPath = join(projectDir, 'data', 'launcher.pid');
// --watchdog: the every-10-minutes task. Silent while the server is fine,
// brings it back if the supervisor itself died, never opens a browser.
const WATCHDOG = process.argv.includes('--watchdog');
// A cold start after logon (Defender scan, Google Drive sync, rebuild) took
// more than 90 s four times in October — give it room before giving up.
const HEALTH_TIMEOUT_MS = 5 * 60 * 1000;
const logPath = join(projectDir, 'autostart.log');
const buildLogPath = join(projectDir, 'autostart-build.log');
// Cloudflare Tunnel (tracker.turonproject.uz) points at this port.
const port = Number.parseInt(process.env.PORT || '3040', 10);
const healthUrl = `http://127.0.0.1:${port}/api/health`;
const networkInfoUrl = `http://127.0.0.1:${port}/api/network-info`;

function timestamp() {
  return new Date().toISOString();
}

async function log(message) {
  await appendFile(logPath, `[${timestamp()}] ${message}\n`, 'utf8');
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function livePidFrom(file) {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 && isPidAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

function acquireLauncherLock() {
  const other = livePidFrom(launcherLockPath);
  if (other && other !== process.pid) return false;
  writeFileSync(launcherLockPath, String(process.pid));
  process.once('exit', () => {
    if (livePidFrom(launcherLockPath) === process.pid) {
      try { unlinkSync(launcherLockPath); } catch { /* already gone */ }
    }
  });
  return true;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function collectPathsRecursively(targetPath, paths) {
  const directoryEntries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    if (entry.name === '.git' || entry.name === '.next' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = join(targetPath, entry.name);

    if (entry.isDirectory()) {
      await collectPathsRecursively(fullPath, paths);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    paths.push(relative(projectDir, fullPath));
  }
}

async function collectManagedSourcePaths() {
  const paths = [];

  for (const directoryName of MANAGED_DIR_NAMES) {
    const fullPath = join(projectDir, directoryName);
    if (!existsSync(fullPath)) {
      continue;
    }

    await collectPathsRecursively(fullPath, paths);
  }

  for (const fileName of MANAGED_FILE_NAMES) {
    if (existsSync(join(projectDir, fileName))) {
      paths.push(fileName);
    }
  }

  return paths.sort();
}

/**
 * Combined content hash of every managed source file (path + bytes). Used
 * instead of mtimes so a touch-without-content-change (editor re-save, git
 * checkout, AV scan) never forces a rebuild — only real content changes do.
 */
async function computeSourceHash() {
  const paths = await collectManagedSourcePaths();
  const hash = createHash('sha256');

  for (const relativePath of paths) {
    hash.update(relativePath);
    hash.update(await readFile(join(projectDir, relativePath)));
  }

  return hash.digest('hex');
}

async function readBuildStamp() {
  try {
    const contents = await readFile(buildStampPath, 'utf8');
    return contents.trim() || null;
  } catch {
    return null;
  }
}

async function writeBuildStamp(hash) {
  await mkdir(dirname(buildStampPath), { recursive: true });
  await writeFile(buildStampPath, hash, 'utf8');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(2_000),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function isServerHealthy() {
  try {
    const payload = await fetchJson(healthUrl);
    return payload?.ok === true;
  } catch {
    return false;
  }
}

async function resolveLanUrls() {
  try {
    const payload = await fetchJson(networkInfoUrl);
    if (Array.isArray(payload?.lanIps)) {
      return formatLanUrls(payload.lanIps, payload.port || port);
    }
  } catch {
    // Fall back to OS network interfaces below.
  }

  const nets = networkInterfaces();
  const lanIps = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }

  return formatLanUrls(lanIps, port);
}

async function runNextCommand(args, logFilePath) {
  const logStream = createWriteStream(logFilePath, { flags: 'a' });

  await log(`Running: node ${args.join(' ')}`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBinPath, ...args], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    child.on('error', reject);
    child.on('close', code => {
      logStream.end();

      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`next ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function writePidFile(pid) {
  try {
    await mkdir(dirname(pidFilePath), { recursive: true });
    await writeFile(pidFilePath, String(pid), 'utf8');
  } catch (err) {
    await log(`Failed to write PID file: ${err.message}`);
  }
}

async function startDetachedServer() {
  const child = spawn(process.execPath, [supervisorPath], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();

  if (child.pid) {
    await writePidFile(child.pid);
  }

  return child.pid;
}

async function ensureBuildIsFresh() {
  const buildExists = existsSync(buildMarkerPath);
  const currentHash = await computeSourceHash();
  const previousHash = buildExists ? await readBuildStamp() : null;

  if (!shouldRebuildFromHash({ buildExists, previousHash, currentHash })) {
    await log('Existing build is fresh enough for autostart.');
    return;
  }

  await log('Build is missing or stale; starting next build.');
  await runNextCommand(['build'], buildLogPath);
  await writeBuildStamp(currentHash);
  await log('Build finished successfully.');
}

async function waitForHealthyServer(timeoutMs = HEALTH_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerHealthy()) {
      return true;
    }

    await sleep(2_000);
  }

  return false;
}

function openBrowser(url) {
  spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

/** Reads APP_TOKEN=... out of .env.local so the auto-opened tab is pre-authenticated. */
function readAppToken() {
  const envPath = join(projectDir, '.env.local');
  if (!existsSync(envPath)) return null;

  try {
    const contents = readFileSync(envPath, 'utf8');
    const match = contents.match(/^APP_TOKEN=(.*)$/m);
    return match ? match[1].trim() || null : null;
  } catch {
    return null;
  }
}

async function notifyTelegram(text) {
  try {
    const Database = require('better-sqlite3');
    const dbPath = join(projectDir, 'data', 'local-db.sqlite');
    if (!existsSync(dbPath)) return;
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT telegram_bot_token, telegram_chat_id FROM settings LIMIT 1').get();
    db.close();
    if (!row?.telegram_bot_token || !row?.telegram_chat_id) return;
    await fetch(`https://api.telegram.org/bot${row.telegram_bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: row.telegram_chat_id, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    await log(`Telegram notify failed: ${e.message}`);
  }
}

async function main() {
  if (!existsSync(nextBinPath)) {
    throw new Error(`Next.js binary not found at ${nextBinPath}`);
  }

  // The watchdog fires every 10 minutes — stay silent while all is well.
  if (await isServerHealthy()) {
    if (!WATCHDOG) await log('Server is already healthy; nothing to launch.');
    return;
  }
  if (!acquireLauncherLock()) {
    if (!WATCHDOG) await log('Another launcher is already starting the server.');
    return;
  }

  const supervisorPid = livePidFrom(supervisorLockPath);
  if (supervisorPid) {
    // The supervisor is alive and restarts the server on its own (crash
    // backoff, health checks) — a rebuild now would pull .next out from under it.
    if (WATCHDOG) return;
    await log(`Supervisor (PID ${supervisorPid}) is running; waiting for the server.`);
  } else {
    await log(WATCHDOG ? 'Watchdog: server and supervisor are down, starting them.' : 'Autostart background launcher started.');
    await ensureBuildIsFresh();
    const pid = await startDetachedServer();
    await log(`Detached Next.js server launched with PID ${pid}.`);
  }

  const healthy = await waitForHealthyServer();
  if (!healthy) {
    throw new Error(`Server did not become healthy within ${HEALTH_TIMEOUT_MS / 60_000} minutes.`);
  }

  const lanUrls = await resolveLanUrls();
  await log(`Server is healthy at http://127.0.0.1:${port}`);
  if (lanUrls.length > 0) {
    await log(`LAN URLs: ${lanUrls.join(', ')}`);
  } else {
    await log('LAN URLs were not detected.');
  }

  if (WATCHDOG) {
    await notifyTelegram('♻️ Сервер трекера был остановлен — сторож запустил его снова.');
    return;
  }
  const token = readAppToken();
  openBrowser(token ? `http://localhost:${port}?token=${token}` : `http://localhost:${port}`);
  await notifyTelegram(`✅ Сервер запущен и работает — http://localhost:${port}`);
}

main().catch(async error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await log(`Autostart failed: ${message}`);
  process.exitCode = 1;
});
