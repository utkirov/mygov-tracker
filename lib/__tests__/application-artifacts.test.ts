import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  deleteArtifacts,
  isValidArtifactFileName,
  readArtifactFile,
  readArtifacts,
  saveArtifacts,
} from '../application-artifacts';

const ref = (title: string) => ({ guid: 'g', title, state: 'Действительный', pin: '1234' });

describe('application artifacts', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'artifacts-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns an empty set for an application without files', async () => {
    expect(await readArtifacts('app-1', root)).toEqual({ screenshot: null, status_pdf: null, results: [] });
  });

  it('stores the screenshot, status PDF and result documents', async () => {
    await saveArtifacts('app-1', {
      screenshotPng: Buffer.from('png'),
      statusPdf: Buffer.from('%PDF-status'),
      results: [{ ref: ref('Решение'), file: Buffer.from('%PDF-1') }],
    }, root);

    const meta = await readArtifacts('app-1', root);
    expect(meta.screenshot?.size).toBe(3);
    expect(meta.status_pdf?.file).toBe('status.pdf');
    expect(meta.results).toEqual([expect.objectContaining({ file: 'result-1.pdf', title: 'Решение', pin: '1234' })]);
    expect((await readArtifactFile('app-1', 'result-1.pdf', root))?.toString()).toBe('%PDF-1');
  });

  it('keeps the previous screenshot when a later check produced none', async () => {
    await saveArtifacts('app-1', { screenshotPng: Buffer.from('first') }, root);
    await saveArtifacts('app-1', { statusPdf: Buffer.from('%PDF') }, root);

    expect((await readArtifactFile('app-1', 'screenshot.png', root))?.toString()).toBe('first');
    expect((await readArtifacts('app-1', root)).status_pdf).not.toBeNull();
  });

  it('replaces the whole result set with a new download', async () => {
    await saveArtifacts('app-1', { results: [{ ref: ref('A'), file: Buffer.from('a') }, { ref: ref('B'), file: Buffer.from('b') }] }, root);
    await saveArtifacts('app-1', { results: [{ ref: ref('C'), file: Buffer.from('c') }] }, root);

    const meta = await readArtifacts('app-1', root);
    expect(meta.results.map((r) => r.title)).toEqual(['C']);
    expect(await readArtifactFile('app-1', 'result-2.pdf', root)).toBeNull();
  });

  it('rejects unsafe ids and file names', async () => {
    expect(isValidArtifactFileName('../meta.json')).toBe(false);
    expect(isValidArtifactFileName('meta.json')).toBe(false);
    expect(isValidArtifactFileName('result-3.pdf')).toBe(true);
    expect(await readArtifactFile('../etc', 'status.pdf', root)).toBeNull();
    expect(await saveArtifacts('../x', { screenshotPng: Buffer.from('x') }, root)).toEqual({ screenshot: null, status_pdf: null, results: [] });
  });

  it('removes everything on delete', async () => {
    await saveArtifacts('app-1', { screenshotPng: Buffer.from('x') }, root);
    await deleteArtifacts('app-1', root);
    expect(await readArtifacts('app-1', root)).toEqual({ screenshot: null, status_pdf: null, results: [] });
  });
});
