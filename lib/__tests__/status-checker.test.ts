// lib/__tests__/status-checker.test.ts
import { parseStatusPage } from '../status-checker';

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
