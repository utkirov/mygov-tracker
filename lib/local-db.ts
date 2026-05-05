import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type LocalPlanId = 'free' | 'standard' | 'pro';

export interface LocalDbProject {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface LocalDbApplication {
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
  applications: LocalDbApplication[];
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
    applications: [],
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
      },
    },
  };
}

function normalizeTheme(value: unknown): LocalDbSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
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

  return {
    theme: normalizeTheme(raw.theme),
    telegram: {
      bot_token: typeof telegram.bot_token === 'string'
        ? telegram.bot_token
        : typeof raw.telegram_token === 'string'
          ? raw.telegram_token
          : defaults.telegram.bot_token,
      chat_id: typeof telegram.chat_id === 'string'
        ? telegram.chat_id
        : typeof raw.telegram_chat_id === 'string'
          ? raw.telegram_chat_id
          : defaults.telegram.chat_id,
    },
    auto_check: {
      enabled: typeof autoCheck.enabled === 'boolean'
        ? autoCheck.enabled
        : typeof raw.auto_check_interval === 'string'
          ? Number(raw.auto_check_interval) > 0
          : defaults.auto_check.enabled,
      interval_minutes: typeof autoCheck.interval_minutes === 'number'
        ? autoCheck.interval_minutes
        : typeof raw.auto_check_interval === 'string'
          ? Number.parseInt(raw.auto_check_interval, 10) || null
          : defaults.auto_check.interval_minutes,
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

function normalizeApplications(value: unknown): LocalDbApplication[] {
  if (!Array.isArray(value)) {
    return [];
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
      created_at: raw.created_at ?? '',
      updated_at: raw.updated_at ?? '',
    };
  });
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
  const payload: LocalDb = {
    ...db,
    meta: {
      version: 1,
      created_at: db.meta.created_at ?? null,
      updated_at: db.meta.updated_at ?? null,
    },
  };
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
