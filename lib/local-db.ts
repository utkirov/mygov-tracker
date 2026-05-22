import path from 'node:path';

import { resolveLocalProjectRoot } from './local-paths';
import { openDb } from './sqlite-db';

export type LocalPlanId = 'free' | 'standard' | 'pro';
export type LocalDbSyncState = 'idle' | 'queued' | 'checking' | 'success' | 'error';
export type LocalDbApplicationChangeField =
  | 'status'
  | 'current_action'
  | 'acting_party'
  | 'last_changed_date';
export interface LocalDbApplicationSyncMetadata {
  sync_state: LocalDbSyncState;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_error: string;
  last_detected_change_at: string | null;
  last_change_summary: string[];
  last_change_fields: LocalDbApplicationChangeField[];
}

export interface LocalDbProject {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface LocalDbApplication extends LocalDbApplicationSyncMetadata {
  id: string;
  application_number: string;
  object_name: string;
  service_name: string;
  organization: string;
  status: string;
  submission_date: string | null;
  last_changed_date: string | null;
  current_action: string;
  acting_party: string;
  verification_password: string;
  sms_phone: string;
  notes: string;
  pdf_filename: string;
  pdf_storage_key: string | null;
  project_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type LocalDbApplicationInput =
  Omit<LocalDbApplication, keyof LocalDbApplicationSyncMetadata>
  & Partial<LocalDbApplicationSyncMetadata>;

export interface LocalDbApplicationCollection extends Array<LocalDbApplication> {
  push(...items: LocalDbApplicationInput[]): number;
}

export interface LocalDbStatusHistory {
  id: string;
  application_id: string;
  status: string;
  current_action: string;
  acting_party: string;
  recorded_at: string;
}

export interface LocalDbSubscription {
  plan_id: LocalPlanId;
  status: 'active' | 'inactive' | 'canceled' | 'expired' | 'trialing';
  expires_at: string | null;
  updated_at: string | null;
}

export interface LocalDbTelegramSettings {
  bot_token: string;
  chat_id: string;
}

export interface LocalDbAutoCheckSettings {
  enabled: boolean;
  interval_minutes: number | null;
  delay_between_checks_ms: number | null;
  concurrency_limit: number | null;
}

export interface LocalDbSettings {
  theme: 'system' | 'light' | 'dark';
  telegram: LocalDbTelegramSettings;
  auto_check: LocalDbAutoCheckSettings;
  sound_enabled: boolean;
}

export interface LocalDb {
  meta: {
    version: 1;
    created_at: string | null;
    updated_at: string | null;
  };
  projects: LocalDbProject[];
  applications: LocalDbApplicationCollection;
  status_history: LocalDbStatusHistory[];
  subscription: LocalDbSubscription;
  settings: LocalDbSettings;
}

// kept for tests / helpers that import this path directly
export function getLocalDbFilePath(rootPath?: string): string {
  return path.join(resolveLocalProjectRoot(rootPath), 'data', 'local-db.sqlite');
}

export function createDefaultLocalDb(): LocalDb {
  return {
    meta: {
      version: 1,
      created_at: null,
      updated_at: null,
    },
    projects: [],
    applications: [] as LocalDbApplicationCollection,
    status_history: [],
    subscription: {
      plan_id: 'pro',
      status: 'active',
      expires_at: null,
      updated_at: null,
    },
    settings: {
      theme: 'system',
      telegram: {
        bot_token: '',
        chat_id: '',
      },
      auto_check: {
        enabled: true,
        interval_minutes: 15,
        delay_between_checks_ms: 2500,
        concurrency_limit: 1,
      },
      sound_enabled: true,
    },
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function normalizeSyncState(value: unknown): LocalDbSyncState {
  return value === 'queued' || value === 'checking' || value === 'success' || value === 'error' || value === 'idle'
    ? value
    : 'idle';
}

function boolFromSqlite(value: unknown): boolean {
  return value === 1 || value === true || value === '1' || value === 'true';
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T[]; } catch { /* ignore */ }
  }
  return [];
}

function rowToApplication(row: Record<string, unknown>): LocalDbApplication {
  return {
    id: String(row.id ?? ''),
    application_number: String(row.application_number ?? ''),
    object_name: String(row.object_name ?? ''),
    service_name: String(row.service_name ?? ''),
    organization: String(row.organization ?? ''),
    status: String(row.status ?? ''),
    submission_date: nullableString(row.submission_date),
    last_changed_date: nullableString(row.last_changed_date),
    current_action: String(row.current_action ?? ''),
    acting_party: String(row.acting_party ?? ''),
    verification_password: String(row.verification_password ?? ''),
    sms_phone: String(row.sms_phone ?? ''),
    notes: String(row.notes ?? ''),
    pdf_filename: String(row.pdf_filename ?? ''),
    pdf_storage_key: nullableString(row.pdf_storage_key),
    project_id: nullableString(row.project_id),
    archived: boolFromSqlite(row.archived),
    sync_state: normalizeSyncState(row.sync_state),
    last_checked_at: nullableString(row.last_checked_at),
    next_check_at: nullableString(row.next_check_at),
    last_error: String(row.last_error ?? ''),
    last_detected_change_at: nullableString(row.last_detected_change_at),
    last_change_summary: parseJsonArray<string>(row.last_change_summary),
    last_change_fields: parseJsonArray<LocalDbApplicationChangeField>(row.last_change_fields),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

// ── public API ─────────────────────────────────────────────────────────────

export interface WriteLocalDbOptions {
  // kept for backwards compat — no-op in SQLite mode
  renameImpl?: unknown;
}

export async function readLocalDb(rootPath?: string): Promise<LocalDb> {
  const db = await openDb(rootPath);

  const meta = db.prepare('SELECT * FROM meta WHERE id = 1').get() as Record<string, unknown> | undefined;
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at').all() as LocalDbProject[];
  const applications = (db.prepare('SELECT * FROM applications ORDER BY created_at').all() as Record<string, unknown>[])
    .map(rowToApplication) as LocalDbApplicationCollection;
  const statusHistory = db.prepare('SELECT * FROM status_history ORDER BY recorded_at').all() as LocalDbStatusHistory[];
  const sub = db.prepare('SELECT * FROM subscription WHERE id = 1').get() as Record<string, unknown> | undefined;
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown> | undefined;

  const defaults = createDefaultLocalDb();

  return {
    meta: {
      version: 1,
      created_at: nullableString(meta?.created_at),
      updated_at: nullableString(meta?.updated_at),
    },
    projects,
    applications,
    status_history: statusHistory,
    subscription: {
      plan_id: (sub?.plan_id === 'standard' || sub?.plan_id === 'pro' ? sub.plan_id : 'free') as LocalPlanId,
      status: (sub?.status ?? defaults.subscription.status) as LocalDbSubscription['status'],
      expires_at: nullableString(sub?.expires_at),
      updated_at: nullableString(sub?.updated_at),
    },
    settings: {
      theme: (settings?.theme === 'light' || settings?.theme === 'dark' ? settings.theme : 'system') as LocalDbSettings['theme'],
      telegram: {
        bot_token: String(settings?.telegram_bot_token ?? ''),
        chat_id: String(settings?.telegram_chat_id ?? ''),
      },
      auto_check: {
        enabled: settings?.auto_check_enabled !== undefined
          ? boolFromSqlite(settings.auto_check_enabled)
          : defaults.settings.auto_check.enabled,
        interval_minutes: settings?.auto_check_interval_minutes != null
          ? Number(settings.auto_check_interval_minutes) || null
          : defaults.settings.auto_check.interval_minutes,
        delay_between_checks_ms: settings?.auto_check_delay_between_checks_ms != null
          ? Number(settings.auto_check_delay_between_checks_ms) || null
          : defaults.settings.auto_check.delay_between_checks_ms,
        concurrency_limit: settings?.auto_check_concurrency_limit != null
          ? Number(settings.auto_check_concurrency_limit) || null
          : defaults.settings.auto_check.concurrency_limit,
      },
      sound_enabled: settings?.sound_enabled !== undefined
        ? boolFromSqlite(settings.sound_enabled)
        : defaults.settings.sound_enabled,
    },
  };
}

export async function writeLocalDb(
  db: LocalDb,
  rootPath?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: WriteLocalDbOptions = {}
): Promise<void> {
  const sqlite = await openDb(rootPath);

  const write = sqlite.transaction(() => {
    // meta
    sqlite.prepare(`
      UPDATE meta SET version = 1, created_at = ?, updated_at = ? WHERE id = 1
    `).run(db.meta.created_at ?? null, db.meta.updated_at ?? null);

    // projects — replace all
    sqlite.prepare('DELETE FROM projects').run();
    const insertProject = sqlite.prepare(`
      INSERT INTO projects (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of db.projects) {
      insertProject.run(p.id, p.name, p.color, p.created_at, p.updated_at);
    }

    // applications — upsert
    const upsertApp = sqlite.prepare(`
      INSERT INTO applications (
        id, application_number, object_name, service_name, organization, status,
        submission_date, last_changed_date, current_action, acting_party,
        verification_password, sms_phone, notes, pdf_filename, pdf_storage_key,
        project_id, archived, sync_state, last_checked_at, next_check_at, last_error,
        last_detected_change_at, last_change_summary, last_change_fields, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        application_number = excluded.application_number,
        object_name = excluded.object_name,
        service_name = excluded.service_name,
        organization = excluded.organization,
        status = excluded.status,
        submission_date = excluded.submission_date,
        last_changed_date = excluded.last_changed_date,
        current_action = excluded.current_action,
        acting_party = excluded.acting_party,
        verification_password = excluded.verification_password,
        sms_phone = excluded.sms_phone,
        notes = excluded.notes,
        pdf_filename = excluded.pdf_filename,
        pdf_storage_key = excluded.pdf_storage_key,
        project_id = excluded.project_id,
        archived = excluded.archived,
        sync_state = excluded.sync_state,
        last_checked_at = excluded.last_checked_at,
        next_check_at = excluded.next_check_at,
        last_error = excluded.last_error,
        last_detected_change_at = excluded.last_detected_change_at,
        last_change_summary = excluded.last_change_summary,
        last_change_fields = excluded.last_change_fields,
        updated_at = excluded.updated_at
    `);

    const appIds = new Set<string>();
    for (const app of db.applications) {
      appIds.add(app.id);
      upsertApp.run(
        app.id,
        app.application_number,
        app.object_name,
        app.service_name,
        app.organization,
        app.status,
        app.submission_date ?? null,
        app.last_changed_date ?? null,
        app.current_action,
        app.acting_party,
        app.verification_password,
        app.sms_phone,
        app.notes,
        app.pdf_filename,
        app.pdf_storage_key ?? null,
        app.project_id ?? null,
        app.archived ? 1 : 0,
        app.sync_state,
        app.last_checked_at ?? null,
        app.next_check_at ?? null,
        app.last_error,
        app.last_detected_change_at ?? null,
        JSON.stringify(app.last_change_summary),
        JSON.stringify(app.last_change_fields),
        app.created_at,
        app.updated_at,
      );
    }

    // remove deleted applications
    const existing = sqlite.prepare('SELECT id FROM applications').all() as { id: string }[];
    const deleteApp = sqlite.prepare('DELETE FROM applications WHERE id = ?');
    for (const { id } of existing) {
      if (!appIds.has(id)) deleteApp.run(id);
    }

    // status_history — upsert (append-only in practice)
    const upsertHistory = sqlite.prepare(`
      INSERT OR IGNORE INTO status_history (id, application_id, status, current_action, acting_party, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const h of db.status_history) {
      upsertHistory.run(h.id, h.application_id, h.status, h.current_action, h.acting_party, h.recorded_at);
    }

    // subscription
    sqlite.prepare(`
      UPDATE subscription SET plan_id = ?, status = ?, expires_at = ?, updated_at = ? WHERE id = 1
    `).run(
      db.subscription.plan_id,
      db.subscription.status,
      db.subscription.expires_at ?? null,
      db.subscription.updated_at ?? null,
    );

    // settings
    sqlite.prepare(`
      UPDATE settings SET
        theme = ?,
        telegram_bot_token = ?,
        telegram_chat_id = ?,
        auto_check_enabled = ?,
        auto_check_interval_minutes = ?,
        auto_check_delay_between_checks_ms = ?,
        auto_check_concurrency_limit = ?,
        sound_enabled = ?
      WHERE id = 1
    `).run(
      db.settings.theme,
      db.settings.telegram.bot_token,
      db.settings.telegram.chat_id,
      db.settings.auto_check.enabled ? 1 : 0,
      db.settings.auto_check.interval_minutes ?? null,
      db.settings.auto_check.delay_between_checks_ms ?? null,
      db.settings.auto_check.concurrency_limit ?? null,
      db.settings.sound_enabled ? 1 : 0,
    );
  });

  write();
}
