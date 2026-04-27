// lib/pdf-parser.ts
import * as pdfParse from 'pdf-parse';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdf = (pdfParse as any).default ?? pdfParse;
import type { ParsedPdf } from '@/types';

function extractLine(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s{2,}(.+?)(?=\\n|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? '';
}

export function extractFieldsFromText(text: string): ParsedPdf {
  return {
    application_number: extractLine(text, 'Номер заявки'),
    service_name: extractLine(text, 'Наименование услуги'),
    organization: extractLine(text, 'Организация'),
    status: extractLine(text, 'Состояние'),
    submission_date: extractLine(text, 'Дата подачи'),
    last_changed_date: extractLine(text, 'Дата последнего изменения'),
    current_action: extractLine(text, 'Текущее действие'),
    acting_party: extractLine(text, 'На данный момент действует'),
    verification_password: extractLine(text, 'Пароль для проверки'),
    sms_phone: extractLine(text, 'Номер телефона для SMS-уведомления'),
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdf(buffer);
  return extractFieldsFromText(data.text);
}
