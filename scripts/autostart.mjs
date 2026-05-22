/**
 * Registers / removes Windows autostart for the Next.js server.
 * Uses Windows Task Scheduler on user logon and a silent VBS wrapper.
 *
 * Usage:
 *   npm run autostart        — register
 *   npm run autostart:remove — remove
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStartServerVbs } = require('./autostart-lib.cjs');

const PROJECT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_NAME = 'mygov-tracker';
const TASK_NAME = `${APP_NAME}-autostart`;
const VBS_PATH = join(PROJECT_DIR, 'start-server.vbs');
const LOG_PATH = join(PROJECT_DIR, 'autostart.log');
const LAUNCHER_PATH = join(PROJECT_DIR, 'scripts', 'background-server.mjs');
const RUN_REGISTRY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

function run(cmd) {
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      err: error.stderr?.toString().trim() || error.message,
    };
  }
}

function quoteForCommand(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function writeLauncherVbs() {
  writeFileSync(
    VBS_PATH,
    buildStartServerVbs({
      projectDir: PROJECT_DIR,
      nodePath: process.execPath,
      launcherPath: LAUNCHER_PATH,
      logPath: LOG_PATH,
    }),
    'utf8'
  );
}

function removeLegacyRegistryEntry() {
  run(`reg delete "${RUN_REGISTRY_KEY}" /v "${APP_NAME}" /f`);
}

function install() {
  writeLauncherVbs();
  removeLegacyRegistryEntry();

  const taskCommand = `${quoteForCommand('wscript.exe')} ${quoteForCommand(VBS_PATH)}`;
  const createResult = run(
    `schtasks /Create /TN "${TASK_NAME}" /SC ONLOGON /TR "${taskCommand}" /F`
  );

  if (createResult.ok) {
    console.log(`Автозапуск зарегистрирован: ${TASK_NAME}`);
    console.log('При входе в Windows сервер будет запускаться тихо в фоне.');
    console.log('Проект остаётся доступен в локальной сети на порту 3000.');
    console.log('Отключить: npm run autostart:remove');
    return;
  }

  const registryValue = `wscript.exe "${VBS_PATH}"`;
  const registryResult = run(
    `reg add "${RUN_REGISTRY_KEY}" /v "${APP_NAME}" /t REG_SZ /d "${registryValue}" /f`
  );

  if (!registryResult.ok) {
    console.error('Не удалось зарегистрировать автозапуск ни через Task Scheduler, ни через HKCU Run.');
    console.error(`Task Scheduler: ${createResult.err}`);
    console.error(`HKCU Run: ${registryResult.err}`);
    process.exit(1);
  }

  console.log('Task Scheduler недоступен из текущего контекста, поэтому включён fallback через HKCU Run.');
  console.log(`Автозапуск зарегистрирован: ${APP_NAME}`);
  console.log('При входе в Windows сервер будет запускаться тихо в фоне.');
  console.log('Проект остаётся доступен в локальной сети на порту 3000.');
  console.log('Отключить: npm run autostart:remove');
}

function remove() {
  run(`schtasks /Delete /TN "${TASK_NAME}" /F`);
  removeLegacyRegistryEntry();

  if (existsSync(VBS_PATH)) {
    unlinkSync(VBS_PATH);
  }

  console.log(`Автозапуск отключён: ${TASK_NAME}`);
}

const action = process.argv[2];

if (action === 'install') {
  install();
} else if (action === 'remove') {
  remove();
} else {
  console.log('Использование:');
  console.log('  npm run autostart        — зарегистрировать автозапуск');
  console.log('  npm run autostart:remove — удалить автозапуск');
  process.exit(1);
}
