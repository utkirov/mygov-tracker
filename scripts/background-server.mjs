import { createWriteStream, existsSync, openSync, statSync } from 'node:fs';
import { appendFile, readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MANAGED_DIR_NAMES,
  MANAGED_FILE_NAMES,
  formatLanUrls,
  shouldRebuildFromEntries,
} = require('./autostart-lib.cjs');

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBinPath = join(projectDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildMarkerPath = join(projectDir, '.next', 'BUILD_ID');
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

async function collectEntriesRecursively(targetPath, entries) {
  const directoryEntries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    if (entry.name === '.git' || entry.name === '.next' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = join(targetPath, entry.name);

    if (entry.isDirectory()) {
      await collectEntriesRecursively(fullPath, entries);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await stat(fullPath);
    entries.push({
      path: relative(projectDir, fullPath),
      mtimeMs: stats.mtimeMs,
    });
  }
}

async function collectManagedSourceEntries() {
  const entries = [];

  for (const directoryName of MANAGED_DIR_NAMES) {
    const fullPath = join(projectDir, directoryName);
    if (!existsSync(fullPath)) {
      continue;
    }

    await collectEntriesRecursively(fullPath, entries);
  }

  for (const fileName of MANAGED_FILE_NAMES) {
    const fullPath = join(projectDir, fileName);
    if (!existsSync(fullPath)) {
      continue;
    }

    const fileStats = await stat(fullPath);
    entries.push({
      path: fileName,
      mtimeMs: fileStats.mtimeMs,
    });
  }

  return entries;
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

function startDetachedServer() {
  const serverLogFd = openSync(serverLogPath, 'a');
  const child = spawn(process.execPath, [nextBinPath, 'start', '-H', '0.0.0.0'], {
    cwd: projectDir,
    detached: true,
    stdio: ['ignore', serverLogFd, serverLogFd],
    windowsHide: true,
  });

  child.unref();
  return child.pid;
}

async function ensureBuildIsFresh() {
  const sourceEntries = await collectManagedSourceEntries();
  const buildExists = existsSync(buildMarkerPath);
  const buildMtimeMs = buildExists ? statSync(buildMarkerPath).mtimeMs : 0;

  if (!shouldRebuildFromEntries({ buildExists, buildMtimeMs, sourceEntries })) {
    await log('Existing build is fresh enough for autostart.');
    return;
  }

  await log('Build is missing or stale; starting next build.');
  await runNextCommand(['build'], buildLogPath);
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
  const pid = startDetachedServer();
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
}

main().catch(async error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await log(`Autostart failed: ${message}`);
  process.exitCode = 1;
});
