// lib/__tests__/pdf-parser.test.ts
import { extractFieldsFromText } from '../pdf-parser';

const SAMPLE_TEXT = `
Номер заявки                285680359
Состояние                   В ожидании оплаты
Дата подачи                 27.04.2026 09:18
Дата последнего изменения   27.04.2026 09:18
Наименование услуги         Подача заявления на согласование проектно-сметной документации по городу Ташкент
Организация                 Министерство строительства и жилищно-коммунального хозяйства Республики Узбекистан
Текущее действие            Оплата
На данный момент действует  Заявитель
Пароль для проверки         73392
Номер телефона для SMS-уведомления  998335008200
`;

describe('extractFieldsFromText', () => {
  it('extracts application number', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.application_number).toBe('285680359');
  });

  it('extracts service name', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.service_name).toContain('согласование проектно-сметной документации');
  });

  it('extracts organization', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.organization).toContain('Министерство строительства');
  });

  it('extracts status', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.status).toBe('В ожидании оплаты');
  });

  it('extracts verification password', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.verification_password).toBe('73392');
  });

  it('extracts acting party', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.acting_party).toBe('Заявитель');
  });

  it('extracts sms phone', () => {
    const result = extractFieldsFromText(SAMPLE_TEXT);
    expect(result.sms_phone).toBe('998335008200');
  });

  it('returns empty strings for missing fields', () => {
    const result = extractFieldsFromText('no matching content here');
    expect(result.application_number).toBe('');
    expect(result.status).toBe('');
  });
});
