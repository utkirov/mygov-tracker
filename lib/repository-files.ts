// lib/repository-files.ts
import * as cheerio from 'cheerio';

const REPOSITORY_ORIGIN = 'https://repository.gov.uz';

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
};

/** One document from the "Файлы в репозитории" block on a my.gov.uz status page — appears when the application is finalized (approval/rejection notices etc.). */
export interface RepositoryFileRef {
  guid: string;
  title: string;
  /** e.g. "Действительный" */
  state: string;
  /** PIN printed next to the file — required by repository.gov.uz to download it. */
  pin: string;
}

/** Parses every "Файлы в репозитории" entry out of a fetched status page. Returns [] when the block isn't present (application not finalized yet). */
export function parseRepositoryFiles(html: string): RepositoryFileRef[] {
  if (!html.includes('repo-file-view')) return [];
  const $ = cheerio.load(html);
  const out: RepositoryFileRef[] = [];

  $('.repo-file-view').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a[href*="guid="]').attr('href') ?? '';
    const guid = href.match(/guid=([\w-]+)/)?.[1];
    if (!guid) return;

    const valueCells = $el.find('table tr').not('.repo-name').first().find('td');
    out.push({
      guid,
      title: $el.find('.repo-title').text().trim(),
      state: $(valueCells[0]).text().trim(),
      pin: $(valueCells[1]).text().trim(),
    });
  });

  return out;
}

function collectCookies(store: Map<string, string>, resp: Response): void {
  const getSetCookie = (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const list = typeof getSetCookie === 'function' ? getSetCookie.call(resp.headers) : [];
  for (const c of list) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) store.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

/**
 * Downloads a finalized-application document from repository.gov.uz using the
 * PIN shown in the status page's "Файлы в репозитории" block. The repository
 * gates each file behind a PIN form (GET page → session cookies + CSRF token →
 * POST RepoPinModel[pin_code] → application/pdf). Returns null (not throw) on
 * any failure — this is a best-effort notification enrichment.
 */
export async function downloadRepositoryFile(ref: RepositoryFileRef): Promise<Buffer | null> {
  try {
    const cookies = new Map<string, string>();
    const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

    // The entry URL 302-redirects (language prefix, WAF cookies) — follow
    // manually so Set-Cookie from every hop is retained.
    let url = `${REPOSITORY_ORIGIN}/ru/file/download?guid=${ref.guid}`;
    let resp: Response | null = null;
    for (let i = 0; i < 5; i++) {
      resp = await fetch(url, { redirect: 'manual', headers: { ...BASE_HEADERS, Cookie: cookieHeader() } });
      collectCookies(cookies, resp);
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (!location) return null;
        url = new URL(location, url).toString();
        continue;
      }
      break;
    }
    if (!resp || !resp.ok) return null;

    const pageHtml = await resp.text();
    const csrfMatch = pageHtml.match(/name="_csrf-myap"\s+value="([^"]+)"/);
    const formMatch = pageHtml.match(/class="pinForm[^"]*"\s+action="([^"]+)"/);
    if (!csrfMatch || !formMatch) return null;

    let hop = await fetch(new URL(formMatch[1], url).toString(), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...BASE_HEADERS,
        Cookie: cookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: url,
        Origin: REPOSITORY_ORIGIN,
      },
      body: new URLSearchParams({ '_csrf-myap': csrfMatch[1], 'RepoPinModel[pin_code]': ref.pin }).toString(),
    });
    collectCookies(cookies, hop);
    for (let i = 0; i < 5 && hop.status >= 300 && hop.status < 400; i++) {
      const location = hop.headers.get('location');
      if (!location) return null;
      hop = await fetch(new URL(location, url).toString(), { redirect: 'manual', headers: { ...BASE_HEADERS, Cookie: cookieHeader() } });
      collectCookies(cookies, hop);
    }

    if (!hop.ok) return null;
    const contentType = hop.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('pdf')) return null;
    return Buffer.from(await hop.arrayBuffer());
  } catch (err) {
    console.error('[RepositoryFiles] Failed to download file:', err);
    return null;
  }
}

/** Parses the status page and downloads every repository document it lists. */
export async function fetchRepositoryFiles(html: string): Promise<Array<{ ref: RepositoryFileRef; file: Buffer }>> {
  const refs = parseRepositoryFiles(html);
  const out: Array<{ ref: RepositoryFileRef; file: Buffer }> = [];
  for (const ref of refs) {
    const file = await downloadRepositoryFile(ref);
    if (file) out.push({ ref, file });
    else console.error(`[RepositoryFiles] Could not download "${ref.title}" (guid ${ref.guid})`);
  }
  return out;
}
