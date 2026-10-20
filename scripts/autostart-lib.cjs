'use strict';

const MANAGED_DIR_NAMES = ['app', 'components', 'lib', 'public', 'scripts', 'types'];
const MANAGED_FILE_NAMES = [
  'instrumentation.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'proxy.ts',
  'tsconfig.json',
];

function escapeVbs(value) {
  return String(value).replace(/"/g, '""');
}

function buildStartServerVbs({ projectDir, nodePath, launcherPath, logPath, launcherArgs = '', logTrigger = true }) {
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
    ...(logTrigger ? [
      'Set logFile = fso.OpenTextFile(logPath, 8, True)',
      'logFile.WriteLine "[" & Now & "] Autostart task triggered"',
      'logFile.Close',
      '',
    ] : []),
    `sh.Run """" & nodeCmd & """ """ & launcherPath & """${launcherArgs ? ` ${escapeVbs(launcherArgs)}` : ''}", 0, False`,
  ].join('\r\n') + '\r\n';
}

function formatLanUrls(lanIps, port) {
  return [...new Set((lanIps || []).filter(Boolean))]
    .sort()
    .map(ip => `http://${ip}:${port}`);
}

/**
 * Content-hash based staleness check: rebuild only if there's no prior build,
 * no recorded stamp for it, or the current source hash differs from the
 * stamped one. Unlike an mtime comparison, this doesn't false-positive on a
 * touch-without-content-change (editor re-save, git checkout, AV scan).
 */
function shouldRebuildFromHash({ buildExists, previousHash, currentHash }) {
  if (!buildExists) {
    return true;
  }

  if (!previousHash) {
    return true;
  }

  return previousHash !== currentHash;
}

module.exports = {
  MANAGED_DIR_NAMES,
  MANAGED_FILE_NAMES,
  buildStartServerVbs,
  formatLanUrls,
  shouldRebuildFromHash,
};
