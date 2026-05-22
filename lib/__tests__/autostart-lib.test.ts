const {
  buildStartServerVbs,
  formatLanUrls,
  shouldRebuildFromEntries,
} = require('../../scripts/autostart-lib.cjs');

describe('autostart-lib', () => {
  it('requires a rebuild when no build marker exists yet', () => {
    expect(
      shouldRebuildFromEntries({
        buildExists: false,
        buildMtimeMs: 0,
        sourceEntries: [],
      })
    ).toBe(true);
  });

  it('requires a rebuild when a source file is newer than the build marker', () => {
    expect(
      shouldRebuildFromEntries({
        buildExists: true,
        buildMtimeMs: 1_000,
        sourceEntries: [{ path: 'app/page.tsx', mtimeMs: 1_001 }],
      })
    ).toBe(true);
  });

  it('skips rebuild when the build marker is newer than all tracked sources', () => {
    expect(
      shouldRebuildFromEntries({
        buildExists: true,
        buildMtimeMs: 5_000,
        sourceEntries: [
          { path: 'app/page.tsx', mtimeMs: 2_000 },
          { path: 'lib/server-scheduler.ts', mtimeMs: 3_000 },
        ],
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
