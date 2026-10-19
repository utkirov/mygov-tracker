import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';

import type { LocalDbApplication, LocalDbApplicationChangeField } from './local-db';
import { CHANGE_FIELD_LABELS } from './status-checker';

// my.gov.uz's own "Скачать в формате PDF" button emits Courier/WinAnsiEncoding
// with no /ToUnicode CMap, which cannot represent Cyrillic at all — every
// Cyrillic character comes back as a literal "?" in the source PDF, not
// something recoverable on our end (confirmed on multiple applications). We
// still send that official file (see fetchApplicationStatusPdf), but pair it
// with this readable snapshot rendered from the already-correctly-parsed
// (UTF-8) status fields. pdf-lib's built-in fonts are WinAnsi-only too, so we
// embed a real system font with Cyrillic coverage — Arial ships with every
// Windows install this app targets — rather than bundling a redistributable
// font file.
const WINDOWS_FONTS_DIR = 'C:\\Windows\\Fonts';
const REGULAR_FONT_PATH = join(WINDOWS_FONTS_DIR, 'arial.ttf');
const BOLD_FONT_PATH = join(WINDOWS_FONTS_DIR, 'arialbd.ttf');

const PAGE_WIDTH = 595; // A4 at 72dpi
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LABEL_COLOR = rgb(0.4, 0.4, 0.4);
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const ACCENT_COLOR = rgb(0.23, 0.43, 0.98);

function fmt(value: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'пусто';
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Wraps text to fit maxWidth, breaking on word boundaries. */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

interface DrawCursor {
  page: PDFPage;
  y: number;
}

function drawField(
  cursor: DrawCursor,
  label: string,
  value: string,
  fonts: { regular: PDFFont; bold: PDFFont },
  color: typeof TEXT_COLOR = TEXT_COLOR
): void {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  cursor.page.drawText(label.toUpperCase(), { x: MARGIN, y: cursor.y, size: 9, font: fonts.bold, color: LABEL_COLOR });
  cursor.y -= 15;

  for (const line of wrapText(value, fonts.regular, 11, maxWidth)) {
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size: 11, font: fonts.regular, color });
    cursor.y -= 16;
  }
  cursor.y -= 8;
}

/**
 * Renders a one-page, readable status snapshot PDF from already-parsed
 * application data — a companion to the official (but Cyrillic-broken)
 * my.gov.uz PDF, not a replacement for it. Returns null (not throw) if the
 * required system font isn't present — this is a best-effort artifact.
 */
export async function buildStatusSnapshotPdf(args: {
  application: LocalDbApplication;
  changedFields: LocalDbApplicationChangeField[];
  previousValues: Record<LocalDbApplicationChangeField, string | null>;
  nextValues: Record<LocalDbApplicationChangeField, string | null>;
}): Promise<Buffer | null> {
  if (!existsSync(REGULAR_FONT_PATH) || !existsSync(BOLD_FONT_PATH)) {
    console.error('[StatusPdf] Arial not found under C:\\Windows\\Fonts — skipping PDF generation.');
    return null;
  }

  try {
    const { application, changedFields, previousValues, nextValues } = args;

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(readFileSync(REGULAR_FONT_PATH), { subset: true });
    const bold = await doc.embedFont(readFileSync(BOLD_FONT_PATH), { subset: true });
    const fonts = { regular, bold };

    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const cursor: DrawCursor = { page, y: PAGE_HEIGHT - MARGIN };

    const title = application.object_name || application.service_name || `Заявление ${application.application_number}`;
    page.drawText('Снимок статуса заявления', { x: MARGIN, y: cursor.y, size: 18, font: bold, color: ACCENT_COLOR });
    cursor.y -= 26;
    for (const line of wrapText(title, bold, 13, PAGE_WIDTH - MARGIN * 2)) {
      page.drawText(line, { x: MARGIN, y: cursor.y, size: 13, font: bold, color: TEXT_COLOR });
      cursor.y -= 18;
    }
    cursor.y -= 10;
    page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: PAGE_WIDTH - MARGIN, y: cursor.y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    cursor.y -= 24;

    drawField(cursor, 'Номер заявления', application.application_number, fonts);
    drawField(cursor, 'Услуга', application.service_name || '—', fonts);
    drawField(cursor, 'Организация', application.organization || '—', fonts);
    drawField(cursor, 'Статус', application.status, fonts, ACCENT_COLOR);
    drawField(cursor, 'Текущее действие', fmt(application.current_action), fonts);
    drawField(cursor, 'Действует', fmt(application.acting_party), fonts);
    drawField(cursor, 'Дата последнего изменения', formatTimestamp(application.last_changed_date), fonts);
    drawField(cursor, 'Проверено', formatTimestamp(application.last_checked_at), fonts);

    if (changedFields.length > 0) {
      cursor.y -= 8;
      page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: PAGE_WIDTH - MARGIN, y: cursor.y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
      cursor.y -= 24;
      page.drawText('ЧТО ИЗМЕНИЛОСЬ', { x: MARGIN, y: cursor.y, size: 9, font: bold, color: LABEL_COLOR });
      cursor.y -= 18;
      for (const field of changedFields) {
        const line = `${CHANGE_FIELD_LABELS[field]}: "${fmt(previousValues[field])}" → "${fmt(nextValues[field])}"`;
        for (const wrapped of wrapText(line, regular, 11, PAGE_WIDTH - MARGIN * 2)) {
          page.drawText(wrapped, { x: MARGIN, y: cursor.y, size: 11, font: regular, color: TEXT_COLOR });
          cursor.y -= 16;
        }
      }
    }

    page.drawText(
      `Сформировано автоматически трекером my.gov.uz · ${formatTimestamp(new Date().toISOString())}`,
      { x: MARGIN, y: MARGIN - 20, size: 8, font: regular, color: LABEL_COLOR }
    );

    return Buffer.from(await doc.save());
  } catch (err) {
    console.error('[StatusPdf] Failed to generate status snapshot PDF:', err);
    return null;
  }
}
