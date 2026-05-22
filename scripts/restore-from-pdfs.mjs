/**
 * Restore applications from PDF files in data/pdfs/
 * Run: node scripts/restore-from-pdfs.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Load better-sqlite3
const Database = require('better-sqlite3');
const pdf = require('pdf-parse');

const DB_PATH = path.join(rootDir, 'data', 'local-db.sqlite');
const PDFS_DIR = path.join(rootDir, 'data', 'pdfs');

// ── PDF parser (mirrors lib/pdf-parser.ts) ────────────────────────────────

const LABELS = {
  application_number: ['Номер заявки', 'Ariza raqami'],
  submission_date:    ['Дата подачи',  'Berilgan sana'],
  status:             ['Состояние',    'Holati'],
  current_action:     ['Текущее действие', 'Hozirgi amal'],
  acting_party:       ['На данный момент действует', 'Hozirda harakat qiluvchi'],
  verification_password: ['Пароль для проверки', 'Tekshirish uchun parol'],
  sms_phone:          ['Номер телефона для SMS', 'SMS telefon raqami'],
};

function extractInline(text, labels) {
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp(esc + "\\s*(.+?)(?=\\n|$)", 'i'));
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return '';
}

function extractFieldsFromText(text) {
  const svcM = text.match(/^\s*\n+(.+?)(?=\n)/);
  const service_name = svcM?.[1]?.trim() ?? '';

  const orgRu = text.match(/Организация\s*\n([\s\S]+?)(?=\nДата подачи|\nСостояние)/i);
  const orgUz = text.match(/Tashkilot\s*\n([\s\S]+?)(?=\nBerilgan sana|\nHolati)/i);
  const organization = (orgRu?.[1] ?? orgUz?.[1] ?? '').replace(/\n/g, ' ').trim();

  const lastRu = text.match(/Дата последнего\s*\nизменения\s*\n(.+?)(?=\n)/i);
  const lastUz = text.match(/Oxirgi o.zgartirish kiritilgan\s*\nsana\s*\n(.+?)(?=\n)/i);
  const last_changed_date = (lastRu?.[1] ?? lastUz?.[1] ?? '').trim();

  return {
    application_number:    extractInline(text, LABELS.application_number),
    service_name,
    organization,
    status:                extractInline(text, LABELS.status),
    submission_date:       extractInline(text, LABELS.submission_date),
    last_changed_date,
    current_action:        extractInline(text, LABELS.current_action),
    acting_party:          extractInline(text, LABELS.acting_party),
    verification_password: extractInline(text, LABELS.verification_password),
    sms_phone:             extractInline(text, LABELS.sms_phone),
  };
}

function parseMyGovDate(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const [, dd, mm, yyyy, hh = '00', min = '00'] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

// ── main ──────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

const pdfFiles = readdirSync(PDFS_DIR)
  .filter(f => f.endsWith('.pdf'))
  .sort();

console.log(`Found ${pdfFiles.length} PDF files\n`);

// Check which application_numbers already exist
const existingNums = new Set(
  db.prepare('SELECT application_number FROM applications').all().map(r => r.application_number)
);

let inserted = 0;
let skipped = 0;
let errors = 0;

for (const filename of pdfFiles) {
  const filePath = path.join(PDFS_DIR, filename);
  const pdfStorageKey = filename;

  // Extract timestamp from filename for created_at
  const tsMatch = filename.match(/^(\d{13})-/);
  const createdAt = tsMatch
    ? new Date(Number(tsMatch[1])).toISOString()
    : new Date().toISOString();

  try {
    const buffer = readFileSync(filePath);
    const { text } = await pdf(buffer);
    const fields = extractFieldsFromText(text);

    if (!fields.application_number) {
      console.log(`⚠  ${filename}: could not extract application_number — skipping`);
      errors++;
      continue;
    }

    if (existingNums.has(fields.application_number)) {
      console.log(`⏭  ${filename}: ${fields.application_number} already in DB — skipping`);
      skipped++;
      continue;
    }

    const id = randomUUID();
    const now = createdAt;

    db.prepare(`
      INSERT INTO applications (
        id, application_number, object_name, service_name, organization, status,
        submission_date, last_changed_date, current_action, acting_party,
        verification_password, sms_phone, notes, pdf_filename, pdf_storage_key,
        project_id, archived, sync_state, last_checked_at, next_check_at, last_error,
        last_detected_change_at, last_change_summary, last_change_fields, created_at, updated_at
      ) VALUES (
        ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, NULL, 0, 'idle',
        NULL, NULL, '', NULL, '[]', '[]', ?, ?
      )
    `).run(
      id,
      fields.application_number,
      fields.service_name,
      fields.organization,
      fields.status,
      parseMyGovDate(fields.submission_date),
      parseMyGovDate(fields.last_changed_date),
      fields.current_action,
      fields.acting_party,
      fields.verification_password,
      fields.sms_phone,
      filename,          // pdf_filename
      pdfStorageKey,     // pdf_storage_key
      now,
      now,
    );

    // Add initial status history entry
    db.prepare(`
      INSERT INTO status_history (id, application_id, status, current_action, acting_party, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, fields.status, fields.current_action, fields.acting_party, now);

    existingNums.add(fields.application_number);
    console.log(`✅ ${fields.application_number} — ${fields.service_name || '(no service name)'}`);
    inserted++;
  } catch (err) {
    console.error(`❌ ${filename}: ${err.message}`);
    errors++;
  }
}

db.close();

console.log(`\n── Summary ──────────────────────────`);
console.log(`  Inserted: ${inserted}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Errors:   ${errors}`);
console.log(`─────────────────────────────────────`);
