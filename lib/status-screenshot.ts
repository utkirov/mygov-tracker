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

  // Dynamic import — puppeteer-core is an ESM-only package; a static import
  // would break under Jest's CommonJS transform. Also keeps it unloaded when
  // no browser is installed (the early return above).
  let browser: Awaited<ReturnType<(typeof import('puppeteer-core'))['default']['launch']>> | null = null;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath, headless: true });
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1000, height: 800 });
    await tab.setContent(patched, { waitUntil: 'load', timeout: 20000 });
    const buffer = await tab.screenshot({ fullPage: true, type: 'png' });
    return Buffer.from(buffer);
  } catch (err) {
    console.error('[StatusScreenshot] Failed to render screenshot:', err);
    return null;
  } finally {
    await browser?.close();
  }
}
