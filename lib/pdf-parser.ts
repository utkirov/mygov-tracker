// lib/pdf-parser.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import type { ParsedPdf } from '@/types';

// Value immediately follows label on the same line (no separator): "Состояние Новое" or "СостояниеНовое"
function extractInline(text: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(esc + '\\s*(.+?)(?=\\n|$)', 'i'));
  return m?.[1]?.trim() ?? '';
}

// Value is on the next line after the label
function extractNextLine(text: string, label: string, until?: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const untilPart = until
    ? until.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : '\\n[А-ЯA-Z]';
  const m = text.match(new RegExp(esc + '\\s*\\n([\\s\\S]+?)(?=\\n' + untilPart + '|$)', 'i'));
  return m?.[1]?.replace(/\n/g, ' ').trim() ?? '';
}

export function extractFieldsFromText(text: string): ParsedPdf {
  // Service name: first non-empty line (the application title)
  const svcM = text.match(/^\s*\n+(.+?)(?=\n)/);
  const service_name = svcM?.[1]?.trim() ?? '';

  // Organization spans multiple lines until "Дата подачи"
  const orgM = text.match(/Организация\s*\n([\s\S]+?)(?=\nДата подачи|\nСостояние)/i);
  const organization = orgM?.[1]?.replace(/\n/g, ' ').trim() ?? '';

  // "Дата последнего изменения" label is split across two lines
  const lastM = text.match(/Дата последнего\s*\nизменения\s*\n(.+?)(?=\n)/i);
  const last_changed_date = lastM?.[1]?.trim() ?? '';

  return {
    application_number: extractInline(text, 'Номер заявки'),
    service_name,
    organization,
    status: extractInline(text, 'Состояние'),
    submission_date: extractInline(text, 'Дата подачи'),
    last_changed_date,
    current_action: extractInline(text, 'Текущее действие'),
    acting_party: extractInline(text, 'На данный момент действует'),
    verification_password: extractInline(text, 'Пароль для проверки'),
    sms_phone: extractInline(text, 'Номер телефона для SMS'),
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdf(buffer);
  return extractFieldsFromText(data.text);
}

export async function getRawText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}
