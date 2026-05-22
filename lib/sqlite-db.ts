import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { resolveLocalProjectRoot } from './local-paths';

let _db: Database.Database | null = null;

export function getDbPath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'local-db.sqlite');
}

/** Close and reset the singleton — used in tests for per-test isolation. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export async function openDb(rootPath?: string): Promise<Database.Database> {
  if (_db) return _db;

  const dbPath = getDbPath(rootPath);
  await mkdir(path.dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  applySchema(_db);
  applyMigrations(_db);
  return _db;
}

function applyMigrations(db: Database.Database): void {
  // Add sound_enabled if missing (existing DBs before this column was introduced)
  const cols = (db.prepare("PRAGMA table_info(settings)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes('sound_enabled')) {
    db.exec("ALTER TABLE settings ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1");
  }
}

function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    INSERT OR IGNORE INTO meta (id, version) VALUES (1, 1);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      application_number TEXT NOT NULL DEFAULT '',
      object_name TEXT NOT NULL DEFAULT '',
      service_name TEXT NOT NULL DEFAULT '',
      organization TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      submission_date TEXT,
      last_changed_date TEXT,
      current_action TEXT NOT NULL DEFAULT '',
      acting_party TEXT NOT NULL DEFAULT '',
      verification_password TEXT NOT NULL DEFAULT '',
      sms_phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      pdf_filename TEXT NOT NULL DEFAULT '',
      pdf_storage_key TEXT,
      project_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      sync_state TEXT NOT NULL DEFAULT 'idle',
      last_checked_at TEXT,
      next_check_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      last_detected_change_at TEXT,
      last_change_summary TEXT NOT NULL DEFAULT '[]',
      last_change_fields TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '',
      current_action TEXT NOT NULL DEFAULT '',
      acting_party TEXT NOT NULL DEFAULT '',
      recorded_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS subscription (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      plan_id TEXT NOT NULL DEFAULT 'pro',
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT,
      updated_at TEXT
    );

    INSERT OR IGNORE INTO subscription (id, plan_id, status) VALUES (1, 'pro', 'active');

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT NOT NULL DEFAULT 'system',
      telegram_bot_token TEXT NOT NULL DEFAULT '',
      telegram_chat_id TEXT NOT NULL DEFAULT '',
      auto_check_enabled INTEGER NOT NULL DEFAULT 0,
      auto_check_interval_minutes INTEGER,
      auto_check_delay_between_checks_ms INTEGER,
      auto_check_concurrency_limit INTEGER,
      sound_enabled INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO settings (id) VALUES (1);


    CREATE TABLE IF NOT EXISTS check_log (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      application_number TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL,
      result TEXT NOT NULL,
      error_message TEXT,
      changed_fields TEXT NOT NULL DEFAULT '[]'
    );
  `);
}
