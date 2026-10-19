/**
 * Registers / removes Windows autostart for the Next.js server.
 * Uses Windows Task Scheduler on user logon and a silent VBS wrapper.
 *
 * Usage:
 *   npm run autostart        — register
 *   npm run autostart:remove — remove
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
const PID_FILE_PATH = join(PROJECT_DIR, 'data', 'server.pid');

// argv-array form — no shell string interpolation/quoting to get wrong.
function run(command, args) {
  try {
    execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      err: error.stderr?.toString().trim() || error.message,
    };
  }
}

/** Kills the detached server process recorded by background-server.mjs, if any. */
function stopRunningServer() {
  if (!existsSync(PID_FILE_PATH)) return;

  try {
    const pid = Number(readFileSync(PID_FILE_PATH, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      // /T: the PID is the supervisor — take its server child down with it.
      if (run('taskkill', ['/PID', String(pid), '/T', '/F']).ok) {
        console.log(`Остановлен работающий сервер (PID ${pid}).`);
      }
    }
  } catch {
    // Unreadable/garbage pidfile — ignore, we'll still remove it below.
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
  run('reg', ['delete', RUN_REGISTRY_KEY, '/v', APP_NAME, '/f']);
}

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function registerUserLogonTask() {
  const script = [
    `$user = "$env:USERDOMAIN\\$env:USERNAME"`,
    `$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${quoteForPowerShell(`"${VBS_PATH}"`)}`,
    `$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user`,
    `$trigger.Delay = 'PT30S'`,
    `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)`,
    `$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited`,
    `Register-ScheduledTask -TaskName ${quoteForPowerShell(TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null`,
  ].join('; ');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

function install() {
  writeLauncherVbs();
  removeLegacyRegistryEntry();

  // /TR takes a single command-line string that Task Scheduler parses itself,
  // so the internal quoting here is meaningful data, not shell escaping.
  const taskCommand = `${quoteForCommand('wscript.exe')} ${quoteForCommand(VBS_PATH)}`;
  let createResult = run('schtasks', [
    // /DELAY gives the D: drive, network and Explorer time to come up — launching
    // at the very instant of logon silently did nothing on this machine.
    '/Create', '/TN', TASK_NAME, '/SC', 'ONLOGON', '/DELAY', '0000:30', '/TR', taskCommand, '/F',
  ]);

  // `schtasks /SC ONLOGON` targets every user and so needs admin rights; a
  // trigger scoped to the current user can be registered without elevation.
  if (!createResult.ok) {
    createResult = registerUserLogonTask();
  }

  if (createResult.ok) {
    console.log(`Автозапуск зарегистрирован: ${TASK_NAME}`);
    console.log('При входе в Windows сервер будет запускаться тихо в фоне.');
    console.log('Проект остаётся доступен в локальной сети на порту 3040.');
    console.log('Отключить: npm run autostart:remove');
    return;
  }

  const registryValue = `wscript.exe "${VBS_PATH}"`;
  const registryResult = run('reg', [
    'add', RUN_REGISTRY_KEY, '/v', APP_NAME, '/t', 'REG_SZ', '/d', registryValue, '/f',
  ]);

  if (!registryResult.ok) {
    console.error('Не удалось зарегистрировать автозапуск ни через Task Scheduler, ни через HKCU Run.');
    console.error(`Task Scheduler: ${createResult.err}`);
    console.error(`HKCU Run: ${registryResult.err}`);
    process.exit(1);
  }

  console.log('Task Scheduler недоступен из текущего контекста, поэтому включён fallback через HKCU Run.');
  console.log(`Автозапуск зарегистрирован: ${APP_NAME}`);
  console.log('При входе в Windows сервер будет запускаться тихо в фоне.');
  console.log('Проект остаётся доступен в локальной сети на порту 3040.');
  console.log('Отключить: npm run autostart:remove');
}

function remove() {
  stopRunningServer();
  run('schtasks', ['/Delete', '/TN', TASK_NAME, '/F']);
  removeLegacyRegistryEntry();

  if (existsSync(VBS_PATH)) {
    unlinkSync(VBS_PATH);
  }

  if (existsSync(PID_FILE_PATH)) {
    unlinkSync(PID_FILE_PATH);
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
