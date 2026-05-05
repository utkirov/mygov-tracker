import * as fsPromises from 'node:fs/promises';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDefaultLocalDb,
  getLocalDbFilePath,
  readLocalDb,
  writeLocalDb,
  type LocalDb,
} from '../local-db';

describe('local-db', () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'local-db-test-'));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('bootstraps the default database when the file does not exist', async () => {
    const db = await readLocalDb(rootPath);
    const filePath = getLocalDbFilePath(rootPath);
    const saved = JSON.parse(await readFile(filePath, 'utf8')) as LocalDb;

    expect(db).toEqual(createDefaultLocalDb());
    expect(saved).toEqual(createDefaultLocalDb());
    expect(saved.subscription).toEqual({
      plan_id: 'pro',
      status: 'active',
      expires_at: null,
      updated_at: null,
    });
    expect(saved.settings).toEqual({
      theme: 'system',
      telegram: {
        bot_token: '',
        chat_id: '',
      },
      auto_check: {
        enabled: false,
        interval_minutes: null,
      },
    });
  });

  it('persists writes and replaces the target file atomically', async () => {
    const db = await readLocalDb(rootPath);
    db.projects.push({
      id: 'project-1',
      name: 'Alpha',
      color: '#0071e3',
      created_at: '2026-05-05T08:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
    });
    db.applications.push({
      id: 'application-1',
      application_number: '285702690',
      object_name: 'Office',
      service_name: 'Permit',
      organization: 'Ministry',
      status: 'New',
      submission_date: '2026-05-05T08:00:00.000Z',
      last_changed_date: null,
      current_action: 'Review',
      acting_party: 'Agency',
      verification_password: '18061',
      sms_phone: '',
      notes: 'Tracked locally',
      pdf_filename: 'invoice.pdf',
      pdf_storage_key: '1746423600000-uuid.pdf',
      project_id: 'project-1',
      archived: false,
      created_at: '2026-05-05T08:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
    });
    db.settings.theme = 'light';
    db.settings.telegram.bot_token = 'token';
    db.settings.auto_check.enabled = true;
    db.settings.auto_check.interval_minutes = 60;
    db.subscription.plan_id = 'standard';

    await writeLocalDb(db, rootPath);

    const filePath = getLocalDbFilePath(rootPath);
    const reloaded = await readLocalDb(rootPath);
    const tempFilePath = `${filePath}.tmp`;

    expect(reloaded).toEqual(db);
    await expect(stat(tempFilePath)).rejects.toThrow();
  });

  it('preserves the existing database file if replace fallback cannot complete', async () => {
    const filePath = getLocalDbFilePath(rootPath);
    const originalDb = createDefaultLocalDb();
    originalDb.subscription.plan_id = 'pro';

    await writeLocalDb(originalDb, rootPath);

    const replacementDb = createDefaultLocalDb();
    replacementDb.subscription.plan_id = 'standard';
    await expect(
      writeLocalDb(replacementDb, rootPath, {
        renameImpl: async () => {
          throw Object.assign(new Error('Permission denied'), { code: 'EPERM' });
        },
      })
    ).rejects.toThrow(
      'Atomic replacement is not available'
    );

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as LocalDb;
    const tempFiles = await fsPromises.readdir(path.dirname(filePath));

    expect(persisted).toEqual(originalDb);
    expect(tempFiles.filter((name) => name.includes('.tmp'))).toHaveLength(0);
  });

  it('normalizes legacy multi-user subscription and flat settings data', async () => {
    const filePath = getLocalDbFilePath(rootPath);

    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(
      filePath,
      `${JSON.stringify({
        meta: { version: 1, created_at: null, updated_at: null },
        projects: [],
        applications: [
          {
            id: 'application-1',
            application_number: '285702690',
            pdf_filename: 'legacy.pdf',
          },
        ],
        status_history: [],
        subscriptions: [
          {
            user_id: 'legacy-user',
            plan_id: 'pro',
            status: 'active',
            expires_at: null,
            updated_at: '2026-05-05T08:00:00.000Z',
          },
        ],
        settings: {
          theme: 'dark',
          telegram_token: 'token',
          telegram_chat_id: 'chat',
          auto_check_interval: '15',
        },
      }, null, 2)}\n`,
      'utf8'
    );

    const db = await readLocalDb(rootPath);

    expect(db.subscription).toEqual({
      plan_id: 'pro',
      status: 'active',
      expires_at: null,
      updated_at: '2026-05-05T08:00:00.000Z',
    });
    expect(db.settings).toEqual({
      theme: 'dark',
      telegram: {
        bot_token: 'token',
        chat_id: 'chat',
      },
      auto_check: {
        enabled: true,
        interval_minutes: 15,
      },
    });
    expect(db.applications[0]?.pdf_storage_key).toBe('legacy.pdf');
  });
});
