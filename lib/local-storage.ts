import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { resolveLocalProjectRoot } from './local-paths';

const PDF_STORAGE_RELATIVE_PATH = path.join('data', 'pdfs');

function sanitizeExtension(originalName?: string): string {
  const extension = originalName ? path.extname(originalName).toLowerCase() : '';
  return extension === '.pdf' ? extension : '.pdf';
}

function toBuffer(contents: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(contents)) {
    return contents;
  }

  if (contents instanceof Uint8Array) {
    return Buffer.from(contents);
  }

  return Buffer.from(contents);
}

export function getPdfStorageDir(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), PDF_STORAGE_RELATIVE_PATH);
}

function getPdfFilePath(filename: string, rootPath?: string): string {
  return path.join(getPdfStorageDir(rootPath), filename);
}

export async function savePdfFile(
  contents: Buffer | Uint8Array | ArrayBuffer,
  originalName?: string,
  rootPath?: string
): Promise<string> {
  const storageDir = getPdfStorageDir(rootPath);
  const filename = `${Date.now()}-${randomUUID()}${sanitizeExtension(originalName)}`;

  await mkdir(storageDir, { recursive: true });
  await writeFile(getPdfFilePath(filename, rootPath), toBuffer(contents));

  return filename;
}

export async function readPdfFile(filename: string, rootPath?: string): Promise<Buffer | null> {
  try {
    return await readFile(getPdfFilePath(filename, rootPath));
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException;
    if (maybeNodeError.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function deletePdfFile(filename: string, rootPath?: string): Promise<boolean> {
  try {
    await rm(getPdfFilePath(filename, rootPath));
    return true;
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException;
    if (maybeNodeError.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}
