// lib/status-checker.ts
import * as cheerio from 'cheerio';

const BASE = 'https://oldmy.gov.uz:4433/ru/site/task-view';
const CAPTCHA_REFRESH = 'https://oldmy.gov.uz:4433/ru/site/captcha?refresh=1';

export interface CheckedStatus {
  status: string;
  current_action: string;
  acting_party: string;
  last_changed_date: string;
}

// Yii2 captcha hash: sum of char codes of the answer string
function computeCaptchaAnswer(hash: number): number {
  for (let ans = 0; ans < 10000; ans++) {
    const computed = String(ans).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    if (computed === hash) return ans;
  }
  return 0;
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

export async function fetchApplicationHtml(
  applicationNumber: string,
  verificationPassword: string
): Promise<string | null> {
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; MyGovTracker/1.0)' };

    const pageResp = await fetch(BASE, { headers });
    if (!pageResp.ok) {
      console.error('[Preview] Initial page fetch failed:', pageResp.status);
      return null;
    }

    const cookie = parseCookies(pageResp);
    const html = await pageResp.text();

    const csrfMatch = html.match(/name="_csrf-myap"\s+value="([^"]+)"/);
    if (!csrfMatch) {
      console.error('[Preview] CSRF token not found in page');
      return null;
    }
    const csrf = csrfMatch[1];

    const captchaResp = await fetch(CAPTCHA_REFRESH, {
      headers: { ...headers, Cookie: cookie, Referer: BASE, 'X-Requested-With': 'XMLHttpRequest' },
    });

    if (!captchaResp.ok) {
      console.error('[Preview] CAPTCHA refresh failed:', captchaResp.status);
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
        ...headers,
        Cookie: cookie,
        Referer: BASE,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!submitResp.ok) {
      console.error('[Preview] Form submission failed:', submitResp.status);
      return null;
    }

    return await submitResp.text();
  } catch (err) {
    console.error('[Preview] Error fetching application HTML:', err);
    return null;
  }
}

export async function fetchApplicationStatus(
  applicationNumber: string,
  verificationPassword: string
): Promise<CheckedStatus | null> {
  const html = await fetchApplicationHtml(applicationNumber, verificationPassword);
  if (!html) return null;
  return parseStatusPage(html);
}
