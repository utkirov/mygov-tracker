import { createWriteStream, existsSync, openSync, readFileSync } from 'node:fs';
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
// Served through server.mjs instead of `next start` so clients can't spoof x-forwarded-for.
const serverScriptPath = join(projectDir, 'server.mjs');
const buildMarkerPath = join(projectDir, '.next', 'BUILD_ID');
const buildStampPath = join(projectDir, 'data', 'build-stamp.txt');
const pidFilePath = join(projectDir, 'data', 'server.pid');
const logPath = join(projectDir, 'autostart.log');
const buildLogPath = join(projectDir, 'autostart-build.log');
const serverLogPath = join(projectDir, 'autostart-server.log');
const healthUrl = 'http://127.0.0.1:3000/api/health';
const networkInfoUrl = 'http://127.0.0.1:3000/api/network-info';
const port = 3000;

function timestamp() {
  return new Date().toISOString();
}

async function log(message) {
  await appendFile(logPath, `[${timestamp()}] ${message}\n`, 'utf8');
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
  const serverLogFd = openSync(serverLogPath, 'a');
  const child = spawn(process.execPath, [serverScriptPath], {
    cwd: projectDir,
    detached: true,
    stdio: ['ignore', serverLogFd, serverLogFd],
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

async function waitForHealthyServer(timeoutMs = 90_000) {
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

async function notifyTelegram() {
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
      body: JSON.stringify({ chat_id: row.telegram_chat_id, text: '✅ Сервер запущен и работает — http://localhost:3000', parse_mode: 'HTML' }),
    });
  } catch (e) {
    await log(`Telegram notify failed: ${e.message}`);
  }
}

async function main() {
  if (!existsSync(nextBinPath)) {
    throw new Error(`Next.js binary not found at ${nextBinPath}`);
  }

  await log('Autostart background launcher started.');

  if (await isServerHealthy()) {
    await log('Server is already healthy; nothing to launch.');
    return;
  }

  await ensureBuildIsFresh();
  const pid = await startDetachedServer();
  await log(`Detached Next.js server launched with PID ${pid}.`);

  const healthy = await waitForHealthyServer();
  if (!healthy) {
    throw new Error('Server did not become healthy within 90 seconds.');
  }

  const lanUrls = await resolveLanUrls();
  await log(`Server is healthy at http://127.0.0.1:${port}`);
  if (lanUrls.length > 0) {
    await log(`LAN URLs: ${lanUrls.join(', ')}`);
  } else {
    await log('LAN URLs were not detected.');
  }

  const token = readAppToken();
  openBrowser(token ? `http://localhost:${port}?token=${token}` : `http://localhost:${port}`);
  await notifyTelegram();
}

main().catch(async error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await log(`Autostart failed: ${message}`);
  process.exitCode = 1;
});
