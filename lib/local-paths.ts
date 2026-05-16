import path from 'node:path';

const STANDALONE_SEGMENT = `${path.sep}.next${path.sep}standalone`;

export function resolveLocalProjectRoot(rootPath?: string): string {
  if (rootPath) {
    return rootPath;
  }

  const envRoot = process.env.LOCAL_APP_ROOT?.trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }

  const cwd = process.cwd();
  const standaloneIndex = cwd.lastIndexOf(STANDALONE_SEGMENT);

  if (standaloneIndex >= 0) {
    return cwd.slice(0, standaloneIndex);
  }

  return cwd;
}
