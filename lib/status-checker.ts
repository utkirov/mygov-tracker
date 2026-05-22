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

export async function fetchApplicationHtml(
  applicationNumber: string,
  verificationPassword: string
): Promise<string | null> {
  try {
    // Full browser-like headers — some my.gov.uz applications return 500
    // when headers like Accept or Accept-Language are missing.
    const baseHeaders = {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control':   'no-cache',
      'Pragma':          'no-cache',
      'Connection':      'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    const pageResp = await fetch(BASE, { headers: baseHeaders });
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
        ...baseHeaders,
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
        ...baseHeaders,
        Cookie: cookie,
        Referer: BASE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://oldmy.gov.uz:4433',
      },
      body: body.toString(),
    });

    if (!submitResp.ok) {
      console.error('[StatusChecker] Form submission failed:', submitResp.status);
      return null;
    }

    return await submitResp.text();
  } catch (err) {
    console.error('[StatusChecker] Error fetching application HTML:', err);
    return null;
  }
}

/**
 * Detects known error pages returned by my.gov.uz and returns
 * a human-readable Russian description, or null if the page looks normal.
 */
function detectMyGovErrorPage(html: string): string | null {
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

export async function fetchApplicationStatus(
  applicationNumber: string,
  verificationPassword: string
): Promise<CheckedStatus> {
  const html = await fetchApplicationHtml(applicationNumber, verificationPassword);
  if (!html) {
    throw new Error('Не удалось подключиться к my.gov.uz. Проверьте интернет-соединение.');
  }

  const errorDescription = detectMyGovErrorPage(html);
  if (errorDescription) {
    const snippet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error(`[StatusChecker] Error page for #${applicationNumber}: ${snippet}`);
    throw new Error(errorDescription);
  }

  const result = parseStatusPage(html);
  if (!result) {
    const snippet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error(`[StatusChecker] parseStatusPage returned null for #${applicationNumber}. Page snippet: ${snippet}`);
    throw new Error('Не удалось распознать страницу с результатом от my.gov.uz. Возможно, изменился формат сайта.');
  }
  return result;
}
