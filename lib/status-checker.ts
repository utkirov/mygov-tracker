// lib/status-checker.ts
import * as cheerio from 'cheerio';

import type { LocalDbApplicationChangeField } from './local-db';

const ORIGIN = 'https://oldmy.gov.uz:4433';
const BASE = `${ORIGIN}/ru/site/task-view`;
const CAPTCHA_REFRESH = `${ORIGIN}/ru/site/captcha?refresh=1`;

// Full browser-like headers — some my.gov.uz applications return 500
// when headers like Accept or Accept-Language are missing.
const BASE_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control':   'no-cache',
  'Pragma':          'no-cache',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

export interface CheckedStatus {
  status: string;
  current_action: string;
  acting_party: string;
  last_changed_date: string;
}

/** Human-readable Russian labels for the tracked application-change fields. */
export const CHANGE_FIELD_LABELS: Record<LocalDbApplicationChangeField, string> = {
  status: 'Статус',
  current_action: 'Текущее действие',
  acting_party: 'Действует',
  last_changed_date: 'Последнее изменение',
};

/** Parses my.gov.uz's `DD.MM.YYYY[ HH:MM]` date format into an ISO string. */
export function parseMyGovDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);

  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const [, dd, mm, yyyy, hh = '00', min = '00'] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

// Yii2 captcha hash: sum of char codes of the answer string.
// Precomputed reverse lookup: hash -> answer (built once, O(1) lookup).
const _captchaTable: Map<number, number> = (() => {
  const t = new Map<number, number>();
  for (let ans = 0; ans < 10000; ans++) {
    const h = String(ans).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    if (!t.has(h)) t.set(h, ans);
  }
  return t;
})();

function computeCaptchaAnswer(hash: number): number {
  return _captchaTable.get(hash) ?? 0;
}

// Extract cookies from Set-Cookie headers into a single Cookie string
function parseCookies(response: Response): string {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(response.headers).map(c => c.split(';')[0]).join('; ');
  }
  // Fallback: combined header (comma-joined, not split-safe, but usually works)
  return (response.headers.get('set-cookie') ?? '').split(',').map(c => c.split(';')[0]).join('; ');
}

export function parseStatusPage(html: string): CheckedStatus | null {
  const $ = cheerio.load(html);

  const fields: Record<string, string> = {};
  $('th').each((_, th) => {
    const label = $(th).text().trim();
    const value = $(th).next('td').text().trim();
    if (label && value && label.length < 80) {
      fields[label] = value;
    }
  });

  const rawStatus = fields['Состояние'];
  if (!rawStatus) return null;

  // Status field has a tooltip appended — take only the first line
  const status = rawStatus.split('\n')[0].trim();

  return {
    status,
    current_action: fields['Текущее действие'] || '',
    acting_party: fields['На данный момент действует'] || '',
    last_changed_date: fields['Дата последнего изменения'] || '',
  };
}

export interface FetchedApplicationPage {
  html: string;
  /** Session cookie for this request — reused by fetchApplicationStatusPdf to download the status PDF without re-solving the captcha. */
  cookie: string;
}

export async function fetchApplicationHtml(
  applicationNumber: string,
  verificationPassword: string
): Promise<FetchedApplicationPage | null> {
  try {
    const pageResp = await fetch(BASE, { headers: BASE_HEADERS });
    if (!pageResp.ok) {
      console.error('[StatusChecker] Initial page fetch failed:', pageResp.status);
      return null;
    }

    const cookie = parseCookies(pageResp);
    const html = await pageResp.text();

    const csrfMatch = html.match(/name="_csrf-myap"\s+value="([^"]+)"/);
    if (!csrfMatch) {
      console.error('[StatusChecker] CSRF token not found in page');
      return null;
    }
    const csrf = csrfMatch[1];

    const captchaResp = await fetch(CAPTCHA_REFRESH, {
      headers: {
        ...BASE_HEADERS,
        Cookie: cookie,
        Referer: BASE,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
    });

    if (!captchaResp.ok) {
      console.error('[StatusChecker] CAPTCHA refresh failed:', captchaResp.status);
      return null;
    }

    const captchaData = (await captchaResp.json()) as { hash1: number };
    const captchaAnswer = computeCaptchaAnswer(captchaData.hash1);

    const body = new URLSearchParams({
      '_csrf-myap': csrf,
      'TaskSearchForm[id]': applicationNumber,
      'TaskSearchForm[pin_code]': verificationPassword,
      'TaskSearchForm[verifyCode]': String(captchaAnswer),
    });

    const submitResp = await fetch(BASE, {
      method: 'POST',
      headers: {
        ...BASE_HEADERS,
        Cookie: cookie,
        Referer: BASE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': ORIGIN,
      },
      body: body.toString(),
    });

    if (!submitResp.ok) {
      console.error('[StatusChecker] Form submission failed:', submitResp.status);
      return null;
    }

    return { html: await submitResp.text(), cookie };
  } catch (err) {
    console.error('[StatusChecker] Error fetching application HTML:', err);
    return null;
  }
}

/**
 * Downloads the "Скачать в формате PDF" status snapshot from the result page
 * produced by fetchApplicationHtml — the official document as issued by
 * my.gov.uz, not a synthesized substitute. Note: my.gov.uz's own PDF
 * generator uses a Courier/WinAnsiEncoding font with no Cyrillic glyphs, so
 * Cyrillic text in the resulting PDF renders as "?" — a known limitation of
 * the source portal, not something fixable on our end. Returns null (not
 * thrown) whenever the PDF isn't available — e.g. very early-stage
 * applications don't show this form yet — since this is a best-effort
 * enrichment, not a required part of the check.
 */
export async function fetchApplicationStatusPdf(
  verificationPassword: string,
  page: FetchedApplicationPage
): Promise<Buffer | null> {
  const formMatch = page.html.match(/<form[^>]+id="w1"[^>]+action="([^"]+)"/);
  if (!formMatch) return null;
  const actionPath = formMatch[1];

  const csrfMatch = page.html.match(/name="_csrf-myap"\s+value="([^"]+)"/);
  if (!csrfMatch) return null;
  const csrf = csrfMatch[1];

  try {
    const pdfResp = await fetch(`${ORIGIN}${actionPath}`, {
      method: 'POST',
      headers: {
        ...BASE_HEADERS,
        Cookie: page.cookie,
        Referer: BASE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': ORIGIN,
      },
      body: new URLSearchParams({
        '_csrf-myap': csrf,
        'TaskPinForm[pin_code]': verificationPassword,
      }).toString(),
    });

    if (!pdfResp.ok) return null;
    const contentType = pdfResp.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('pdf')) return null;

    return Buffer.from(await pdfResp.arrayBuffer());
  } catch (err) {
    console.error('[StatusChecker] Failed to download status PDF:', err);
    return null;
  }
}

/**
 * Detects known error pages returned by my.gov.uz and returns
 * a human-readable Russian description, or null if the page looks normal.
 */
export function detectMyGovErrorPage(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/внутренняя ошибка сервера/i.test(text))
    return 'Сервер my.gov.uz вернул внутреннюю ошибку для этого заявления. Данные могут быть недоступны в старой системе. Попробуйте проверить статус вручную на сайте oldmy.gov.uz:4433.';
  if (/не удалось проверить переданные данные/i.test(text))
    return 'Ошибка проверки безопасности (CSRF). Попробуйте снова через несколько секунд.';
  if (/заявление не найдено|не найдено|not found/i.test(text))
    return 'Заявление не найдено в базе my.gov.uz. Проверьте номер заявления и пароль.';
  if (/неверный пароль|неверный код|код подтверждения/i.test(text))
    return 'Неверный пароль проверки. Убедитесь, что пароль в настройках заявления совпадает с указанным на my.gov.uz.';
  return null;
}

export interface StatusCheckSession {
  status: CheckedStatus;
  /** The fetched result page + its session cookie — pass to fetchApplicationStatusPdf to also download the status PDF. */
  page: FetchedApplicationPage;
}

/**
 * Same check as fetchApplicationStatus, but also returns the raw result page
 * and its session cookie so the caller can follow up with
 * fetchApplicationStatusPdf() without re-solving the captcha.
 */
export async function fetchApplicationStatusSession(
  applicationNumber: string,
  verificationPassword: string
): Promise<StatusCheckSession> {
  const page = await fetchApplicationHtml(applicationNumber, verificationPassword);
  if (!page) {
    throw new Error('Не удалось подключиться к my.gov.uz. Проверьте интернет-соединение.');
  }

  const errorDescription = detectMyGovErrorPage(page.html);
  if (errorDescription) {
    const snippet = page.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error(`[StatusChecker] Error page for #${applicationNumber}: ${snippet}`);
    throw new Error(errorDescription);
  }

  const result = parseStatusPage(page.html);
  if (!result) {
    const snippet = page.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error(`[StatusChecker] parseStatusPage returned null for #${applicationNumber}. Page snippet: ${snippet}`);
    throw new Error('Не удалось распознать страницу с результатом от my.gov.uz. Возможно, изменился формат сайта.');
  }
  return { status: result, page };
}

export async function fetchApplicationStatus(
  applicationNumber: string,
  verificationPassword: string
): Promise<CheckedStatus> {
  const { status } = await fetchApplicationStatusSession(applicationNumber, verificationPassword);
  return status;
}
