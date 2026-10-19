// lib/pdf-parser.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { ParsedPdf } from '@/types';

const execFileAsync = promisify(execFile);
const OCR_SCRIPT_PATH = join(process.cwd(), 'scripts', 'ocr-pdf.ps1');

// Labels for each field in both supported languages (Russian / Uzbek).
// "HoIati" (capital I for lowercase l) is not a typo here — it's how the
// Windows OCR fallback (scripts/ocr-pdf.ps1) consistently misreads "Holati"
// on real my.gov.uz scans, confirmed against actual OCR output.
const LABELS = {
  application_number: ['Номер заявки', 'Ariza raqami'],
  submission_date:    ['Дата подачи',  'Berilgan sana'],
  status:             ['Состояние',    'Holati', 'HoIati'],
  current_action:     ['Текущее действие', 'Hozirgi amal'],
  acting_party:       ['На данный момент действует', 'Hozirda harakat qiluvchi'],
  verification_password: ['Пароль для проверки', 'Tekshirish uchun parol'],
  sms_phone:          ['Номер телефона для SMS', 'SMS telefon raqami'],
};

// The my.gov.uz masthead ("my.gov.uz Единый портал интерактивных
// государственных услуг") is a logo image on the actual page — invisible to
// pdf-parse's text-layer extraction, but read as real text by the OCR
// fallback, which would otherwise get mistaken for the service name below.
const MASTHEAD_LINE_PATTERN = /^(my\.gov\.uz|Единый портал|интерактивных|государственных услуг)/i;

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
  // Service name: first non-empty, non-masthead line (application title).
  // pdf-parse output starts with a blank line then the title directly;
  // OCR output has no such leading blank and additionally sees the
  // masthead logo as text, so this skips both rather than assuming either shape.
  const service_name = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0 && !MASTHEAD_LINE_PATTERN.test(line)) ?? '';

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

  // Verification password — label may be split across two lines:
  // RU inline: "Пароль для проверки11214" or "Пароль для проверки 11214"
  // RU split:  "Пароль для\nпроверки\n11214"
  // UZ inline: "Tekshirish uchun parol11214"
  // UZ split:  "Tekshirish uchun\nparol\n11214"
  let verification_password = extractInline(text, LABELS.verification_password);
  if (!verification_password) {
    const pwRu = text.match(/Пароль для\s*\nпроверки\s*\n(.+?)(?=\n)/i);
    const pwUz = text.match(/Tekshirish uchun\s*\nparol\s*\n(.+?)(?=\n)/i);
    verification_password = (pwRu?.[1] ?? pwUz?.[1] ?? '').trim();
  }

  return {
    application_number:   extractInline(text, LABELS.application_number),
    service_name,
    organization,
    status:               extractInline(text, LABELS.status),
    submission_date:      extractInline(text, LABELS.submission_date),
    last_changed_date,
    current_action:       extractInline(text, LABELS.current_action),
    acting_party:         extractInline(text, LABELS.acting_party),
    verification_password,
    sms_phone:            extractInline(text, LABELS.sms_phone),
  };
}

/** A PDF with essentially no extractable text layer is almost certainly a scan. */
export function looksLikeScannedPdf(text: string): boolean {
  return text.trim().length < 100;
}

/**
 * Windows-native OCR fallback for scanned PDFs — renders each page and
 * recognizes text via WinRT (Windows.Data.Pdf + Windows.Media.Ocr, see
 * scripts/ocr-pdf.ps1), no external dependency or model download. Returns
 * null (not throw) on any failure — non-Windows, the Russian OCR language
 * pack isn't installed, timeout, etc. — since this is a best-effort
 * enrichment; the caller already has pdf-parse's (empty) result to fall
 * back to.
 */
export async function ocrPdfBuffer(buffer: Buffer): Promise<string | null> {
  if (process.platform !== 'win32') return null;

  const dir = await mkdtemp(join(tmpdir(), 'mygov-ocr-'));
  const pdfPath = join(dir, 'input.pdf');
  try {
    await writeFile(pdfPath, buffer);
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', OCR_SCRIPT_PATH, '-PdfPath', pdfPath],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 60_000 }
    );
    const text = stdout.trim();
    return text || null;
  } catch (err) {
    console.error('[PdfParser] OCR fallback failed:', err);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdf> {
  const data = await pdf(buffer);
  if (looksLikeScannedPdf(data.text)) {
    const ocrText = await ocrPdfBuffer(buffer);
    if (ocrText) return extractFieldsFromText(ocrText);
  }
  return extractFieldsFromText(data.text);
}

export async function getRawText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  if (looksLikeScannedPdf(data.text)) {
    const ocrText = await ocrPdfBuffer(buffer);
    if (ocrText) return ocrText;
  }
  return data.text;
}
