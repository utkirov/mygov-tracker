// Keeps the tracker server alive: runs server.mjs as a child, restarts it when
// it exits or stops answering /api/health, and writes its output to a rotating
// log (logs/server.log, 5 MB × 4 files). Started (detached) by
// background-server.mjs at Windows logon; only one supervisor per project.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createRotatingLog, nextRestartDelay } = require('./rotating-log.cjs');

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const lockPath = join(projectDir, 'data', 'supervisor.pid');
const port = process.env.PORT || '3000';
const healthUrl = `http://127.0.0.1:${port}/api/health`;

const STABLE_MS = 10 * 60 * 1000;
const HEALTH_INTERVAL_MS = 60 * 1000;
const HEALTH_FAILURES_BEFORE_RESTART = 3;
const STARTUP_GRACE_MS = 90 * 1000;

mkdirSync(join(projectDir, 'logs'), { recursive: true });
mkdirSync(join(projectDir, 'data'), { recursive: true });
const log = createRotatingLog(join(projectDir, 'logs', 'server.log'));
const note = (msg) => log.write(`[supervisor ${new Date().toISOString()}] ${msg}\n`);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (existsSync(lockPath)) {
  const other = Number(readFileSync(lockPath, 'utf8').trim());
  if (other && other !== process.pid && isAlive(other)) {
    note(`another supervisor is running (PID ${other}) — exiting`);
    process.exit(0);
  }
}
writeFileSync(lockPath, String(process.pid));

let child = null;
let startedAt = 0;
let failures = 0;
let healthFailures = 0;
let stopping = false;

function start() {
  startedAt = Date.now();
  healthFailures = 0;
  child = spawn(process.execPath, [join(projectDir, 'server.mjs')], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  note(`server started, PID ${child.pid}`);
  child.stdout.on('data', (d) => log.write(d));
  child.stderr.on('data', (d) => log.write(d));
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    const ranMs = Date.now() - startedAt;
    failures = ranMs > STABLE_MS ? 0 : failures + 1;
    const delay = nextRestartDelay(failures);
    note(`server exited (code ${code}, signal ${signal}) after ${Math.round(ranMs / 1000)} s — restarting in ${delay / 1000} s`);
    setTimeout(start, delay);
  });
}

async function checkHealth() {
  if (!child || Date.now() - startedAt < STARTUP_GRACE_MS) return;
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
    healthFailures = response.ok ? 0 : healthFailures + 1;
  } catch {
    healthFailures++;
  }
  if (healthFailures >= HEALTH_FAILURES_BEFORE_RESTART && child) {
    note(`health check failed ${healthFailures} times — killing PID ${child.pid}`);
    healthFailures = 0;
    child.kill();
  }
}

function shutdown() {
  stopping = true;
  if (child) child.kill();
  try { unlinkSync(lockPath); } catch { /* already gone */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => void checkHealth(), HEALTH_INTERVAL_MS);
start();
