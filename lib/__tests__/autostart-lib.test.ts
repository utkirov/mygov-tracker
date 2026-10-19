// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CJS helper, no ESM export surface
const autostartLib = require('../../scripts/autostart-lib.cjs');
const { buildStartServerVbs, formatLanUrls, shouldRebuildFromHash } = autostartLib;

describe('autostart-lib', () => {
  it('requires a rebuild when no build marker exists yet', () => {
    expect(
      shouldRebuildFromHash({
        buildExists: false,
        previousHash: null,
        currentHash: 'abc123',
      })
    ).toBe(true);
  });

  it('requires a rebuild when a build exists but no stamp was recorded for it', () => {
    expect(
      shouldRebuildFromHash({
        buildExists: true,
        previousHash: null,
        currentHash: 'abc123',
      })
    ).toBe(true);
  });

  it('requires a rebuild when the current source hash differs from the stamp', () => {
    expect(
      shouldRebuildFromHash({
        buildExists: true,
        previousHash: 'abc123',
        currentHash: 'def456',
      })
    ).toBe(true);
  });

  it('skips rebuild when the current source hash matches the stamp', () => {
    expect(
      shouldRebuildFromHash({
        buildExists: true,
        previousHash: 'abc123',
        currentHash: 'abc123',
      })
    ).toBe(false);
  });

  it('builds LAN urls from IPv4 addresses and removes duplicates', () => {
    expect(formatLanUrls(['192.168.0.10', '192.168.0.10', '10.0.0.7'], 3000)).toEqual([
      'http://10.0.0.7:3000',
      'http://192.168.0.10:3000',
    ]);
  });

  it('creates a hidden VBS launcher that starts node directly', () => {
    const script = buildStartServerVbs({
      projectDir: 'D:\\project',
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      launcherPath: 'D:\\project\\scripts\\background-server.mjs',
      logPath: 'D:\\project\\autostart.log',
    });

    expect(script).toContain('projectDir = "D:\\project"');
    expect(script).toContain('nodeCmd = "C:\\Program Files\\nodejs\\node.exe"');
    expect(script).toContain('launcherPath = "D:\\project\\scripts\\background-server.mjs"');
    expect(script).toContain('logPath = "D:\\project\\autostart.log"');
    expect(script).toContain('0, False');
    expect(script).not.toContain('npm start');
  });
});
