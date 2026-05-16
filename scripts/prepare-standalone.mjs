import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, '.next', 'standalone');
const sourceStaticDir = path.join(projectRoot, '.next', 'static');
const sourcePublicDir = path.join(projectRoot, 'public');

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findStandaloneServerDirs(rootDir) {
  const results = [];

  async function walk(currentDir, depth = 0) {
    if (depth > 6) {
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });

    if (entries.some((entry) => entry.isFile() && entry.name === 'server.js')) {
      results.push(currentDir);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (entry.name === 'node_modules') {
        continue;
      }

      await walk(path.join(currentDir, entry.name), depth + 1);
    }
  }

  if (await pathExists(rootDir)) {
    await walk(rootDir);
  }

  return results;
}

async function ensureStandaloneAssets(serverDir) {
  const targetNextDir = path.join(serverDir, '.next');
  const targetStaticDir = path.join(targetNextDir, 'static');
  const targetPublicDir = path.join(serverDir, 'public');

  await mkdir(targetNextDir, { recursive: true });

  if (await pathExists(sourceStaticDir)) {
    await cp(sourceStaticDir, targetStaticDir, { recursive: true, force: true });
  }

  if (await pathExists(sourcePublicDir)) {
    await cp(sourcePublicDir, targetPublicDir, { recursive: true, force: true });
  }
}

const serverDirs = await findStandaloneServerDirs(standaloneRoot);

if (serverDirs.length === 0) {
  console.warn('No standalone server.js directories found; skipping standalone asset preparation.');
  process.exit(0);
}

for (const serverDir of serverDirs) {
  await ensureStandaloneAssets(serverDir);
  console.log(`Prepared standalone assets for ${serverDir}`);
}
