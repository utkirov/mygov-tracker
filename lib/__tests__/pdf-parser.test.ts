// lib/__tests__/pdf-parser.test.ts
import { extractFieldsFromText } from '../pdf-parser';

// Real format from my.gov.uz: value immediately follows label with no separator
const REAL_PDF_TEXT = `

Подача заявления на согласование проектно-сметной документации по городу Ташкент
Номер заявки285702690
Организация
Министерство строительства и жилищно-коммунального хозяйства Республики
Узбекистан
Дата подачи27.04.2026 15:48
Дата последнего
изменения
27.04.2026 15:48
СостояниеНовое
Текущее действиеПринять на рассмотрение
Пароль для проверки18061
`;

// Format with acting party (later stage)
const WITH_ACTING_PARTY = `

Согласование ПСД
Номер заявки285680359
Организация
Министерство строительства
Дата подачи27.04.2026 09:18
Дата последнего
изменения
27.04.2026 10:45
СостояниеВ ожидании оплаты
Текущее действиеОплата
На данный момент действуетЗаявитель
Пароль для проверки73392
`;

describe('extractFieldsFromText – real my.gov.uz format', () => {
  it('extracts application number', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).application_number).toBe('285702690');
  });

  it('extracts service name from first line', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).service_name).toContain(
      'согласование проектно-сметной документации'
    );
  });

  it('extracts organization spanning multiple lines', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).organization).toContain(
      'Министерство строительства'
    );
  });

  it('extracts status', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).status).toBe('Новое');
  });

  it('extracts submission date', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).submission_date).toBe('27.04.2026 15:48');
  });

  it('extracts last changed date (split-line label)', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).last_changed_date).toBe('27.04.2026 15:48');
  });

  it('extracts current action', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).current_action).toBe('Принять на рассмотрение');
  });

  it('extracts verification password', () => {
    expect(extractFieldsFromText(REAL_PDF_TEXT).verification_password).toBe('18061');
  });

  it('extracts acting party when present', () => {
    expect(extractFieldsFromText(WITH_ACTING_PARTY).acting_party).toBe('Заявитель');
  });

  it('returns empty string for missing fields', () => {
    const r = extractFieldsFromText('no matching content');
    expect(r.application_number).toBe('');
    expect(r.status).toBe('');
  });
});
