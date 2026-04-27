// lib/__tests__/status-checker.test.ts
import { parseStatusPage, buildStatusCheckUrl } from '../status-checker';

describe('buildStatusCheckUrl', () => {
  it('builds correct URL with number and password', () => {
    const url = buildStatusCheckUrl('285680359', '73392');
    expect(url).toContain('285680359');
    expect(url).toContain('73392');
  });
});

describe('parseStatusPage', () => {
  const sampleHtml = `
    <html><body>
      <table>
        <tr><td>Состояние</td><td>В ожидании оплаты</td></tr>
        <tr><td>Текущее действие</td><td>Оплата</td></tr>
        <tr><td>На данный момент действует</td><td>Заявитель</td></tr>
        <tr><td>Дата последнего изменения</td><td>27.04.2026 10:45</td></tr>
      </table>
    </body></html>
  `;

  it('extracts status from table', () => {
    const result = parseStatusPage(sampleHtml);
    expect(result?.status).toBe('В ожидании оплаты');
  });

  it('extracts current action', () => {
    const result = parseStatusPage(sampleHtml);
    expect(result?.current_action).toBe('Оплата');
  });

  it('extracts acting party', () => {
    const result = parseStatusPage(sampleHtml);
    expect(result?.acting_party).toBe('Заявитель');
  });

  it('returns null for unrecognized HTML structure', () => {
    const result = parseStatusPage('<html><body>Not found</body></html>');
    expect(result).toBeNull();
  });
});
