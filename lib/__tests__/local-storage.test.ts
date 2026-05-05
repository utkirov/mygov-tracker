import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  deletePdfFile,
  getPdfStorageDir,
  readPdfFile,
  savePdfFile,
} from '../local-storage';

describe('local-storage', () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'local-storage-test-'));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('saves pdf files with unique filenames and preserves contents', async () => {
    const content = Buffer.from('%PDF-1.4 test content');

    const firstName = await savePdfFile(content, 'invoice.pdf', rootPath);
    const secondName = await savePdfFile(content, 'invoice.pdf', rootPath);
    const saved = await readPdfFile(firstName, rootPath);
    const storageDir = getPdfStorageDir(rootPath);

    expect(firstName).not.toBe(secondName);
    expect(saved?.equals(content)).toBe(true);
    await expect(stat(path.join(storageDir, firstName))).resolves.toBeDefined();
    await expect(stat(path.join(storageDir, secondName))).resolves.toBeDefined();
  });

  it('reads and deletes saved pdf files', async () => {
    const content = Buffer.from('%PDF-1.4 delete me');
    const filename = await savePdfFile(content, 'status-check.pdf', rootPath);

    expect(await readPdfFile(filename, rootPath)).toEqual(content);
    await expect(deletePdfFile(filename, rootPath)).resolves.toBe(true);
    await expect(deletePdfFile(filename, rootPath)).resolves.toBe(false);
    await expect(readPdfFile(filename, rootPath)).resolves.toBeNull();

    const storageDir = getPdfStorageDir(rootPath);
    await expect(readFile(path.join(storageDir, filename))).rejects.toThrow();
  });
});
