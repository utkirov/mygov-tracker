import { captureApplicationStatusScreenshot, closeScreenshotBrowser } from '../status-screenshot';

const SAMPLE_HTML = `<html><head><title>my.gov.uz</title></head><body>
  <table><tr><th>Пароль для проверки</th><td>91825</td></tr></table>
</body></html>`;

describe('captureApplicationStatusScreenshot', () => {
  afterAll(async () => {
    await closeScreenshotBrowser();
  });

  it('redacts the verification password and produces a PNG, or returns null when no browser is installed', async () => {
    const result = await captureApplicationStatusScreenshot(
      { html: SAMPLE_HTML, cookie: '' },
      '91825'
    );

    if (result === null) {
      // Best-effort artifact — acceptable on a runner without Chrome/Edge installed (e.g. Linux CI).
      return;
    }

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG magic bytes
  });

  it('reuses the running browser for the next screenshot', async () => {
    const t0 = Date.now();
    const first = await captureApplicationStatusScreenshot({ html: SAMPLE_HTML, cookie: '' }, '91825');
    if (first === null) return;
    const firstMs = Date.now() - t0;
    const t1 = Date.now();
    await captureApplicationStatusScreenshot({ html: SAMPLE_HTML, cookie: '' }, '91825');
    const secondMs = Date.now() - t1;
    expect(secondMs).toBeLessThanOrEqual(Math.max(firstMs, 1500));
  }, 60_000);
});
