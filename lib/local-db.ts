import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

const LOCAL_DB_RELATIVE_PATH = path.join('data', 'local-db.json');

export function getLocalDbFilePath(rootPath: string = process.cwd()): string {
  return path.join(rootPath, LOCAL_DB_RELATIVE_PATH);
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
        enabled: false,
        interval_minutes: null,
        delay_between_checks_ms: null,
        concurrency_limit: null,
      },
    },
  };
}

function normalizeTheme(value: unknown): LocalDbSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = normalizeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  const parsed = normalizeInteger(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return null;
}

function normalizeSyncState(value: unknown): LocalDbSyncState {
  return value === 'queued' ||
    value === 'checking' ||
    value === 'success' ||
    value === 'error' ||
    value === 'idle'
    ? value
    : 'idle';
}

function normalizeChangeFields(value: unknown): LocalDbApplicationChangeField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (field): field is LocalDbApplicationChangeField =>
      field === 'status' ||
      field === 'current_action' ||
      field === 'acting_party' ||
      field === 'last_changed_date'
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeSettings(value: unknown): LocalDbSettings {
  const defaults = createDefaultLocalDb().settings;
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const raw = value as Record<string, unknown>;
  const telegram = raw.telegram && typeof raw.telegram === 'object'
    ? raw.telegram as Record<string, unknown>
    : {};
  const autoCheck = raw.auto_check && typeof raw.auto_check === 'object'
    ? raw.auto_check as Record<string, unknown>
    : {};
  const intervalMinutes = normalizePositiveInteger(autoCheck.interval_minutes ?? raw.auto_check_interval);
  const delayBetweenChecksMs = normalizeNonNegativeInteger(
    autoCheck.delay_between_checks_ms ??
    raw.auto_check_delay_ms ??
    raw.auto_check_delay_between_checks_ms
  );
  const concurrencyLimit = normalizePositiveInteger(
    autoCheck.concurrency_limit ??
    raw.auto_check_concurrency ??
    raw.auto_check_concurrency_limit
  );
  const enabled =
    normalizeBoolean(autoCheck.enabled ?? raw.auto_check_enabled) ??
    (intervalMinutes !== null ? intervalMinutes > 0 : defaults.auto_check.enabled);

  return {
    theme: normalizeTheme(raw.theme),
    telegram: {
      bot_token: normalizeString(telegram.bot_token ?? raw.telegram_token, defaults.telegram.bot_token),
      chat_id: normalizeString(telegram.chat_id ?? raw.telegram_chat_id, defaults.telegram.chat_id),
    },
    auto_check: {
      enabled,
      interval_minutes: intervalMinutes,
      delay_between_checks_ms: delayBetweenChecksMs,
      concurrency_limit: concurrencyLimit,
    },
  };
}

function normalizeSubscription(value: unknown): LocalDbSubscription {
  const defaults = createDefaultLocalDb().subscription;
  if (Array.isArray(value)) {
    return normalizeSubscription(value[0]);
  }

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const raw = value as Partial<LocalDbSubscription>;

  return {
    plan_id: raw.plan_id === 'standard' || raw.plan_id === 'pro' ? raw.plan_id : 'free',
    status: raw.status ?? defaults.status,
    expires_at: raw.expires_at ?? defaults.expires_at,
    updated_at: raw.updated_at ?? defaults.updated_at,
  };
}

function normalizeApplications(value: unknown): LocalDbApplicationCollection {
  if (!Array.isArray(value)) {
    return [] as LocalDbApplicationCollection;
  }

  return value.map((application) => {
    const raw = application as Partial<LocalDbApplication>;

    return {
      id: raw.id ?? '',
      application_number: raw.application_number ?? '',
      object_name: raw.object_name ?? '',
      service_name: raw.service_name ?? '',
      organization: raw.organization ?? '',
      status: raw.status ?? '',
      submission_date: raw.submission_date ?? null,
      last_changed_date: raw.last_changed_date ?? null,
      current_action: raw.current_action ?? '',
      acting_party: raw.acting_party ?? '',
      verification_password: raw.verification_password ?? '',
      sms_phone: raw.sms_phone ?? '',
      notes: raw.notes ?? '',
      pdf_filename: raw.pdf_filename ?? '',
      pdf_storage_key: raw.pdf_storage_key ?? raw.pdf_filename ?? null,
      project_id: raw.project_id ?? null,
      archived: raw.archived ?? false,
      sync_state: normalizeSyncState(raw.sync_state),
      last_checked_at: normalizeNullableString(raw.last_checked_at),
      next_check_at: normalizeNullableString(raw.next_check_at),
      last_error: normalizeString(raw.last_error, ''),
      last_detected_change_at: normalizeNullableString(raw.last_detected_change_at),
      last_change_summary: normalizeStringArray(raw.last_change_summary),
      last_change_fields: normalizeChangeFields(raw.last_change_fields),
      created_at: raw.created_at ?? '',
      updated_at: raw.updated_at ?? '',
    };
  }) as LocalDbApplicationCollection;
}

function normalizeLocalDb(value: unknown): LocalDb {
  const defaults = createDefaultLocalDb();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const raw = value as Partial<LocalDb>;

  return {
    meta: {
      version: 1,
      created_at: raw.meta?.created_at ?? defaults.meta.created_at,
      updated_at: raw.meta?.updated_at ?? defaults.meta.updated_at,
    },
    projects: Array.isArray(raw.projects) ? raw.projects : defaults.projects,
    applications: normalizeApplications(raw.applications),
    status_history: Array.isArray(raw.status_history) ? raw.status_history : defaults.status_history,
    subscription: normalizeSubscription(
      raw.subscription ?? (raw as Record<string, unknown>).subscriptions
    ),
    settings: normalizeSettings(raw.settings),
  };
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function createTempFilePath(filePath: string): string {
  return `${filePath}.${randomUUID()}.tmp`;
}

async function cleanupTempFile(tempFilePath: string): Promise<void> {
  await rm(tempFilePath, { force: true });
}

async function destinationExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException;
    if (maybeNodeError.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export interface WriteLocalDbOptions {
  renameImpl?: typeof rename;
}

export async function writeLocalDb(
  db: LocalDb,
  rootPath: string = process.cwd(),
  options: WriteLocalDbOptions = {}
): Promise<void> {
  const filePath = getLocalDbFilePath(rootPath);
  const renameImpl = options.renameImpl ?? rename;
  const payload = normalizeLocalDb({
    ...db,
    meta: {
      version: 1,
      created_at: db.meta.created_at ?? null,
      updated_at: db.meta.updated_at ?? null,
    },
  });
  const tempFilePath = createTempFilePath(filePath);

  await ensureParentDirectory(filePath);
  await writeFile(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    await renameImpl(tempFilePath, filePath);
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException;
    if (
      maybeNodeError.code !== 'EEXIST' &&
      maybeNodeError.code !== 'EPERM' &&
      maybeNodeError.code !== 'EACCES'
    ) {
      await cleanupTempFile(tempFilePath);
      throw error;
    }

    const hasExistingFile = await destinationExists(filePath);
    await cleanupTempFile(tempFilePath);

    if (!hasExistingFile) {
      throw error;
    }

    throw new Error(
      `Atomic replacement is not available for ${path.basename(filePath)} on this platform; existing file was preserved.`
    );
  }
}

export async function readLocalDb(rootPath: string = process.cwd()): Promise<LocalDb> {
  const filePath = getLocalDbFilePath(rootPath);

  try {
    const raw = await readFile(filePath, 'utf8');
    return normalizeLocalDb(JSON.parse(raw));
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException;
    if (maybeNodeError.code !== 'ENOENT') {
      throw error;
    }
  }

  const db = createDefaultLocalDb();
  await writeLocalDb(db, rootPath);
  return createDefaultLocalDb();
}
