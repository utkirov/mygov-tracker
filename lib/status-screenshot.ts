// lib/status-screenshot.ts
import { existsSync } from 'node:fs';

import type { FetchedApplicationPage } from './status-checker';

const ORIGIN = 'https://oldmy.gov.uz:4433';

// ponytail: no bundled-Chromium dependency — reuse whatever browser is
// already installed. Add more candidate paths if this ever runs on a
// machine without Chrome or Edge.
const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowserExecutable(): string | null {
  return BROWSER_CANDIDATES.find(existsSync) ?? null;
}

/**
 * Renders the my.gov.uz status result page (the same HTML fetchApplicationHtml
 * returns) as a full-page PNG via an already-installed Chrome/Edge. Unlike the
 * official "Скачать в формате PDF" download (see status-checker.ts), this is a
 * real browser render, so Cyrillic comes through correctly — and it captures
 * the whole page (payments, ЭЦП, form details), not just the tracked fields.
 * The verification password is redacted before rendering, since a screenshot
 * has no reveal-toggle protection like the app's own UI does. Returns null
 * (not throw) when no supported browser is installed — best-effort enrichment.
 */
export async function captureApplicationStatusScreenshot(
  page: FetchedApplicationPage,
  verificationPassword: string
): Promise<Buffer | null> {
  const executablePath = findBrowserExecutable();
  if (!executablePath) return null;

  const redactedHtml = verificationPassword
    ? page.html.replaceAll(verificationPassword, '••••••')
    : page.html;
  const patched = redactedHtml.includes('<head>')
    ? redactedHtml.replace('<head>', `<head><base href="${ORIGIN}/">`)
    : `<base href="${ORIGIN}/">${redactedHtml}`;

  let tab: Awaited<ReturnType<Browser['newPage']>> | null = null;
  try {
    const browser = await getBrowser(executablePath);
    tab = await browser.newPage();
    await tab.setViewport({ width: 1000, height: 800 });
    await tab.setContent(patched, { waitUntil: 'load', timeout: 20000 });
    const buffer = await tab.screenshot({ fullPage: true, type: 'png' });
    return Buffer.from(buffer);
  } catch (err) {
    console.error('[StatusScreenshot] Failed to render screenshot:', err);
    await closeBrowser();
    return null;
  } finally {
    await tab?.close().catch(() => {});
    scheduleIdleClose();
  }
}

// One Chrome reused across screenshots (launching it costs several seconds),
// closed after 5 idle minutes so it doesn't sit in memory between cycles.
type Browser = Awaited<ReturnType<(typeof import('puppeteer-core'))['default']['launch']>>;
const IDLE_CLOSE_MS = 5 * 60 * 1000;
let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function getBrowser(executablePath: string): Promise<Browser> {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!browserPromise) {
    // Dynamic import — puppeteer-core is ESM-only; a static import would break
    // under Jest's CommonJS transform, and it stays unloaded without a browser.
    browserPromise = import('puppeteer-core').then(({ default: puppeteer }) => puppeteer.launch({ executablePath, headless: true }));
    browserPromise.then((b) => b.on('disconnected', () => { browserPromise = null; })).catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

export { closeBrowser as closeScreenshotBrowser };

async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  await pending?.then((b) => b.close()).catch(() => {});
}
