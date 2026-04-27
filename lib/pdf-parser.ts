// lib/pdf-parser.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import type { ParsedPdf } from '@/types';

// Labels for each field in both supported languages (Russian / Uzbek)
const LABELS = {
  application_number: ['Номер заявки', 'Ariza raqami'],
  submission_date:    ['Дата подачи',  'Berilgan sana'],
  status:             ['Состояние',    'Holati'],
  current_action:     ['Текущее действие', 'Hozirgi amal'],
  acting_party:       ['На данный момент действует', 'Hozirda harakat qiluvchi'],
  verification_password: ['Пароль для проверки', 'Tekshirish uchun parol'],
  sms_phone:          ['Номер телефона для SMS', 'SMS telefon raqami'],
};

// Value immediately follows label on the same line: "ХолатиНовое" or "Holati Yangi"
function extractInline(text: string, labels: string[]): string {
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp(esc + "\\s*(.+?)(?=\\n|$)", 'i'));
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return '';
}

export function extractFieldsFromText(text: string): ParsedPdf {
  // Service name: first non-empty line (application title)
  const svcM = text.match(/^\s*\n+(.+?)(?=\n)/);
  const service_name = svcM?.[1]?.trim() ?? '';

  // Organization (RU): spans multiple lines until "Дата подачи" or "Состояние"
  const orgRu = text.match(/Организация\s*\n([\s\S]+?)(?=\nДата подачи|\nСостояние)/i);
  // Organization (UZ): spans multiple lines until "Berilgan sana" or "Holati"
  const orgUz = text.match(/Tashkilot\s*\n([\s\S]+?)(?=\nBerilgan sana|\nHolati)/i);
  const organization = (orgRu?.[1] ?? orgUz?.[1] ?? '').replace(/\n/g, ' ').trim();

  // Last changed date — label is split across two lines in both languages
  // RU: "Дата последнего\nизменения\n<value>"
  // UZ: "Oxirgi o'zgartirish kiritilgan\nsana\n<value>"
  const lastRu = text.match(/Дата последнего\s*\nизменения\s*\n(.+?)(?=\n)/i);
  const lastUz = text.match(/Oxirgi o.zgartirish kiritilgan\s*\nsana\s*\n(.+?)(?=\n)/i);
  const last_changed_date = (lastRu?.[1] ?? lastUz?.[1] ?? '').trim();

  return {
    application_number:   extractInline(text, LABELS.application_number),
    service_name,
    organization,
    status:               extractInline(text, LABELS.status),
    submission_date:      extractInline(text, LABELS.submission_date),
    last_changed_date,
    current_action:       extractInline(text, LABELS.current_action),
    acting_party:         extractInline(text, LABELS.acting_party),
    verification_password: extractInline(text, LABELS.verification_password),
    sms_phone:            extractInline(text, LABELS.sms_phone),
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
