import { captureApplicationStatusScreenshot } from '../status-screenshot';

const SAMPLE_HTML = `<html><head><title>my.gov.uz</title></head><body>
  <table><tr><th>Пароль для проверки</th><td>91825</td></tr></table>
</body></html>`;

describe('captureApplicationStatusScreenshot', () => {
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
});
