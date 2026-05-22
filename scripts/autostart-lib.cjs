'use strict';

const MANAGED_DIR_NAMES = ['app', 'components', 'lib', 'public', 'scripts', 'types'];
const MANAGED_FILE_NAMES = [
  'instrumentation.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'tsconfig.json',
];

function escapeVbs(value) {
  return String(value).replace(/"/g, '""');
}

function buildStartServerVbs({ projectDir, nodePath, launcherPath, logPath }) {
  const escapedProjectDir = escapeVbs(projectDir);
  const escapedNodePath = escapeVbs(nodePath);
  const escapedLauncherPath = escapeVbs(launcherPath);
  const escapedLogPath = escapeVbs(logPath);

  return [
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `Dim projectDir : projectDir = "${escapedProjectDir}"`,
    `Dim nodeCmd : nodeCmd = "${escapedNodePath}"`,
    `Dim launcherPath : launcherPath = "${escapedLauncherPath}"`,
    `Dim logPath : logPath = "${escapedLogPath}"`,
    '',
    'Set logFile = fso.OpenTextFile(logPath, 8, True)',
    'logFile.WriteLine "[" & Now & "] Autostart task triggered"',
    'logFile.Close',
    '',
    'sh.Run """" & nodeCmd & """ """ & launcherPath & """", 0, False',
  ].join('\r\n') + '\r\n';
}

function formatLanUrls(lanIps, port) {
  return [...new Set((lanIps || []).filter(Boolean))]
    .sort()
    .map(ip => `http://${ip}:${port}`);
}

function shouldRebuildFromEntries({ buildExists, buildMtimeMs, sourceEntries }) {
  if (!buildExists) {
    return true;
  }

  return (sourceEntries || []).some(entry => {
    if (!entry || typeof entry.mtimeMs !== 'number') {
      return false;
    }

    return entry.mtimeMs > buildMtimeMs;
  });
}

module.exports = {
  MANAGED_DIR_NAMES,
  MANAGED_FILE_NAMES,
  buildStartServerVbs,
  formatLanUrls,
  shouldRebuildFromEntries,
};
