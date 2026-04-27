// lib/status-checker.ts
import * as cheerio from 'cheerio';

// NOTE: This URL needs verification against the real my.gov.uz public status page.
// Open my.gov.uz, find the public application status check page (no login required),
// and update STATUS_CHECK_BASE if needed.
const STATUS_CHECK_BASE = 'https://my.gov.uz/ru/service/appeal/status';

export interface CheckedStatus {
  status: string;
  current_action: string;
  acting_party: string;
  last_changed_date: string;
}

export function buildStatusCheckUrl(applicationNumber: string, password: string): string {
  const params = new URLSearchParams({ number: applicationNumber, password });
  return `${STATUS_CHECK_BASE}?${params.toString()}`;
}

export function parseStatusPage(html: string): CheckedStatus | null {
  const $ = cheerio.load(html);

  function findByLabel(label: string): string {
    let value = '';
    $('td, th').each((_, el) => {
      const text = $(el).text().trim();
      if (text === label) {
        value = $(el).next('td').text().trim();
        return false as unknown as void;
      }
    });
    return value;
  }

  const status = findByLabel('Состояние');
  if (!status) return null;

  return {
    status,
    current_action: findByLabel('Текущее действие'),
    acting_party: findByLabel('На данный момент действует'),
    last_changed_date: findByLabel('Дата последнего изменения'),
  };
}

export async function fetchApplicationStatus(
  applicationNumber: string,
  verificationPassword: string
): Promise<CheckedStatus | null> {
  const url = buildStatusCheckUrl(applicationNumber, verificationPassword);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ApplicationTracker/1.0)',
      Accept: 'text/html',
    },
  });

  if (!response.ok) return null;

  const html = await response.text();
  return parseStatusPage(html);
}
