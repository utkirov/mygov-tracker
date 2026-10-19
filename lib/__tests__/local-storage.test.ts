import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  deletePdfFile,
  getPdfStorageDir,
  hasPdfMagicBytes,
  isValidPdfStorageKey,
  MAX_PDF_UPLOAD_BYTES,
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

  it('rejects path traversal keys instead of touching files outside the storage dir', async () => {
    // Plant a file just outside the storage dir that a traversal key would target.
    const outsideFile = path.join(rootPath, 'evil.pdf');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(outsideFile, 'secret'));

    const traversalKeys = ['../../evil.pdf', '..\\..\\evil.pdf', '../evil.pdf'];

    for (const key of traversalKeys) {
      expect(isValidPdfStorageKey(key)).toBe(false);
      await expect(readPdfFile(key, rootPath)).resolves.toBeNull();
      await expect(deletePdfFile(key, rootPath)).resolves.toBe(false);
    }

    // The planted file must survive every rejected delete attempt.
    await expect(readFile(outsideFile, 'utf8')).resolves.toBe('secret');
  });

  it('accepts a legitimately-generated key and round-trips it', async () => {
    const content = Buffer.from('%PDF-1.4 legit content');
    const key = await savePdfFile(content, 'invoice.pdf', rootPath);

    expect(isValidPdfStorageKey(key)).toBe(true);
    await expect(readPdfFile(key, rootPath)).resolves.toEqual(content);
    await expect(deletePdfFile(key, rootPath)).resolves.toBe(true);
  });
});

describe('hasPdfMagicBytes', () => {
  it('accepts a buffer that starts with the PDF signature', () => {
    expect(hasPdfMagicBytes(Buffer.from('%PDF-1.4 rest of the file'))).toBe(true);
  });

  it('rejects a buffer without the PDF signature', () => {
    expect(hasPdfMagicBytes(Buffer.from('<html>not a pdf</html>'))).toBe(false);
  });

  it('rejects a buffer shorter than the signature', () => {
    expect(hasPdfMagicBytes(Buffer.from('%PDF'))).toBe(false);
  });

  it('exposes a positive, sane upload size cap', () => {
    expect(MAX_PDF_UPLOAD_BYTES).toBeGreaterThan(0);
  });
});
