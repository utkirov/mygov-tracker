// lib/__tests__/status-checker.test.ts
import {
  CHANGE_FIELD_LABELS,
  detectMyGovErrorPage,
  fetchApplicationHtml,
  fetchApplicationStatus,
  fetchApplicationStatusPdf,
  parseMyGovDate,
  parseStatusPage,
} from '../status-checker';

// Real oldmy.gov.uz HTML uses <th> for labels and <td> for values
const SAMPLE_HTML = `
  <html><body>
    <table>
      <tr><th>Состояние</th><td>В ожидании оплаты\nTooltip text</td></tr>
      <tr><th>Текущее действие</th><td>Оплата</td></tr>
      <tr><th>На данный момент действует</th><td>Заявитель</td></tr>
      <tr><th>Дата последнего изменения</th><td>27.04.2026 10:45</td></tr>
    </table>
  </body></html>
`;

describe('parseStatusPage', () => {
  it('extracts status (first line only, strips tooltip)', () => {
    expect(parseStatusPage(SAMPLE_HTML)?.status).toBe('В ожидании оплаты');
  });

  it('extracts current action', () => {
    expect(parseStatusPage(SAMPLE_HTML)?.current_action).toBe('Оплата');
  });

  it('extracts acting party', () => {
    expect(parseStatusPage(SAMPLE_HTML)?.acting_party).toBe('Заявитель');
  });

  it('extracts last changed date', () => {
    expect(parseStatusPage(SAMPLE_HTML)?.last_changed_date).toBe('27.04.2026 10:45');
  });

  it('returns null when status field is missing', () => {
    expect(parseStatusPage('<html><body>Not found</body></html>')).toBeNull();
  });
});

describe('parseMyGovDate', () => {
  it('parses DD.MM.YYYY HH:MM into an ISO-shaped local string', () => {
    expect(parseMyGovDate('27.04.2026 10:45')).toBe('2026-04-27T10:45:00');
  });

  it('parses a date-only value, defaulting the time to 00:00', () => {
    expect(parseMyGovDate('27.04.2026')).toBe('2026-04-27T00:00:00');
  });

  it('returns null for null, undefined, and empty input', () => {
    expect(parseMyGovDate(null)).toBeNull();
    expect(parseMyGovDate(undefined)).toBeNull();
    expect(parseMyGovDate('')).toBeNull();
  });

  it('falls back to Date parsing for non-matching formats, and null for garbage', () => {
    expect(parseMyGovDate('2026-04-27T10:45:00.000Z')).toBe('2026-04-27T10:45:00.000Z');
    expect(parseMyGovDate('not a date')).toBeNull();
  });
});

describe('CHANGE_FIELD_LABELS', () => {
  it('has a Russian label for every tracked change field', () => {
    expect(CHANGE_FIELD_LABELS).toEqual({
      status: 'Статус',
      current_action: 'Текущее действие',
      acting_party: 'Действует',
      last_changed_date: 'Последнее изменение',
    });
  });
});

// Minimal Response-like stub: fetchApplicationHtml only touches .ok/.status/.text()/.json()/.headers.
function fakeResponse({
  ok = true,
  status = 200,
  text = '',
  json = undefined as unknown,
  cookies = [] as string[],
}: {
  ok?: boolean;
  status?: number;
  text?: string;
  json?: unknown;
  cookies?: string[];
}) {
  return {
    ok,
    status,
    text: async () => text,
    json: async () => json,
    headers: {
      getSetCookie: () => cookies,
      get: (name: string) => (name.toLowerCase() === 'set-cookie' ? cookies.join(', ') : null),
    },
  } as unknown as Response;
}

describe('detectMyGovErrorPage', () => {
  it('matches the internal-server-error page', () => {
    expect(detectMyGovErrorPage('<html><body>Внутренняя ошибка сервера</body></html>'))
      .toMatch(/внутренн/i);
  });

  it('matches the CSRF validation-failure page', () => {
    expect(detectMyGovErrorPage('<html><body>Не удалось проверить переданные данные</body></html>'))
      .toMatch(/CSRF/);
  });

  it('matches a not-found page', () => {
    expect(detectMyGovErrorPage('<html><body>Заявление не найдено</body></html>'))
      .toMatch(/не найдено/i);
  });

  it('matches a wrong-password page', () => {
    expect(detectMyGovErrorPage('<html><body>Неверный пароль проверки</body></html>'))
      .toMatch(/пароль/i);
  });

  it('returns null for an ordinary status page', () => {
    expect(detectMyGovErrorPage(SAMPLE_HTML)).toBeNull();
  });
});

describe('fetchApplicationHtml', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns null when the initial page fetch is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(fakeResponse({ ok: false, status: 500 }));

    const result = await fetchApplicationHtml('12345', 'pw');

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the CSRF token field is missing from the initial page', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ text: '<html><body>no csrf token here</body></html>' }));

    const result = await fetchApplicationHtml('12345', 'pw');

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('completes a captcha-solve + form-submit round trip and returns the final HTML', async () => {
    const initialHtml = '<html><body><input name="_csrf-myap" value="tok123"></body></html>';
    // Yii2 captcha hash is the sum of char codes of the answer string.
    // "0" -> charCode('0') = 48, and 0 is the first answer that produces hash 48.
    const captchaHash = '0'.charCodeAt(0);
    const finalHtml = '<html><body>final result page</body></html>';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ text: initialHtml, cookies: ['PHPSESSID=abc; Path=/'] }))
      .mockResolvedValueOnce(fakeResponse({ json: { hash1: captchaHash } }))
      .mockResolvedValueOnce(fakeResponse({ text: finalHtml }));
    global.fetch = fetchMock;

    const result = await fetchApplicationHtml('12345', 'pw');

    expect(result?.html).toBe(finalHtml);
    expect(result?.cookie).toBe('PHPSESSID=abc');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const submitCall = fetchMock.mock.calls[2];
    expect(submitCall[0]).toBe('https://oldmy.gov.uz:4433/ru/site/task-view');
    const submitBody = new URLSearchParams(submitCall[1].body as string);
    expect(submitBody.get('_csrf-myap')).toBe('tok123');
    expect(submitBody.get('TaskSearchForm[id]')).toBe('12345');
    expect(submitBody.get('TaskSearchForm[pin_code]')).toBe('pw');
    expect(submitBody.get('TaskSearchForm[verifyCode]')).toBe('0');
  });
});

describe('fetchApplicationStatus', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws a connection error when the HTML fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(fakeResponse({ ok: false, status: 500 }));

    await expect(fetchApplicationStatus('12345', 'pw')).rejects.toThrow(
      'Не удалось подключиться к my.gov.uz. Проверьте интернет-соединение.'
    );
  });

  it('throws the localized message for a known my.gov.uz error page', async () => {
    const initialHtml = '<html><body><input name="_csrf-myap" value="tok123"></body></html>';
    const captchaHash = '0'.charCodeAt(0);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ text: initialHtml }))
      .mockResolvedValueOnce(fakeResponse({ json: { hash1: captchaHash } }))
      .mockResolvedValueOnce(fakeResponse({ text: '<html><body>Заявление не найдено</body></html>' }));

    await expect(fetchApplicationStatus('12345', 'pw')).rejects.toThrow(
      'Заявление не найдено в базе my.gov.uz. Проверьте номер заявления и пароль.'
    );
  });

  it('throws a parse error when the result page has no recognizable status field', async () => {
    const initialHtml = '<html><body><input name="_csrf-myap" value="tok123"></body></html>';
    const captchaHash = '0'.charCodeAt(0);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ text: initialHtml }))
      .mockResolvedValueOnce(fakeResponse({ json: { hash1: captchaHash } }))
      .mockResolvedValueOnce(fakeResponse({ text: '<html><body>unrecognized page shape</body></html>' }));

    await expect(fetchApplicationStatus('12345', 'pw')).rejects.toThrow(
      'Не удалось распознать страницу с результатом от my.gov.uz. Возможно, изменился формат сайта.'
    );
  });

  it('returns the parsed status on a successful round trip', async () => {
    const initialHtml = '<html><body><input name="_csrf-myap" value="tok123"></body></html>';
    const captchaHash = '0'.charCodeAt(0);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ text: initialHtml }))
      .mockResolvedValueOnce(fakeResponse({ json: { hash1: captchaHash } }))
      .mockResolvedValueOnce(fakeResponse({ text: SAMPLE_HTML }));

    const result = await fetchApplicationStatus('12345', 'pw');

    expect(result).toEqual({
      status: 'В ожидании оплаты',
      current_action: 'Оплата',
      acting_party: 'Заявитель',
      last_changed_date: '27.04.2026 10:45',
    });
  });
});

describe('fetchApplicationStatusPdf', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const PAGE_WITH_PDF_FORM = {
    html: '<form id="w1" class="col-md-12" action="/ru/some-service/task-view/get-pdf?id=12345" method="post">'
      + '<input type="hidden" name="_csrf-myap" value="pdftok456">'
      + '<button type="submit">Скачать в формате PDF</button></form>',
    cookie: 'PHPSESSID=abc',
  };

  it('returns null when the page has no PDF-download form (e.g. an early-stage application)', async () => {
    global.fetch = jest.fn();

    const result = await fetchApplicationStatusPdf('pw', { html: '<html><body>no form here</body></html>', cookie: 'PHPSESSID=abc' });

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts the extracted action + CSRF + pin_code and returns the PDF bytes', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 fake pdf content');
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null) },
      arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
    } as unknown as Response);
    global.fetch = fetchMock;

    const result = await fetchApplicationStatusPdf('pw', PAGE_WITH_PDF_FORM);

    expect(result).toEqual(pdfBytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oldmy.gov.uz:4433/ru/some-service/task-view/get-pdf?id=12345');
    expect(init.headers.Cookie).toBe('PHPSESSID=abc');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('_csrf-myap')).toBe('pdftok456');
    expect(body.get('TaskPinForm[pin_code]')).toBe('pw');
  });

  it('returns null when the response is not a PDF (e.g. an HTML error page)', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);

    const result = await fetchApplicationStatusPdf('pw', PAGE_WITH_PDF_FORM);

    expect(result).toBeNull();
  });

  it('returns null (not throw) when the download request fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, headers: { get: () => null } } as unknown as Response);

    const result = await fetchApplicationStatusPdf('pw', PAGE_WITH_PDF_FORM);

    expect(result).toBeNull();
  });
});
