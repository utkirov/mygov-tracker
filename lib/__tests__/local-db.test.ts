import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDefaultLocalDb,
  getLocalDbFilePath,
  readLocalDb,
  writeLocalDb,
} from '../local-db';
import { closeDb } from '../sqlite-db';

describe('local-db', () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'local-db-test-'));
  });

  afterEach(async () => {
    closeDb(); // reset singleton so next test gets a fresh connection
    await rm(rootPath, { recursive: true, force: true });
  });

  it('bootstraps the default database when the sqlite file does not exist', async () => {
    const db = await readLocalDb(rootPath);
    const filePath = getLocalDbFilePath(rootPath);

    // SQLite file should be created on disk
    await expect(stat(filePath)).resolves.toBeTruthy();

    expect(db.meta.version).toBe(1);
    expect(db.projects).toEqual([]);
    expect(db.applications).toEqual([]);
    expect(db.status_history).toEqual([]);
    expect(db.subscription).toEqual({
      plan_id: 'pro',
      status: 'active',
      expires_at: null,
      updated_at: null,
    });
    expect(db.settings.telegram).toEqual({ bot_token: '', chat_id: '' });
    expect(db.settings.auto_check.enabled).toBe(false);
  });

  it('persists writes and reads back correctly via SQLite', async () => {
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
      sync_state: 'idle',
      last_checked_at: null,
      next_check_at: null,
      last_error: '',
      last_detected_change_at: null,
      last_change_summary: [],
      last_change_fields: [],
      created_at: '2026-05-05T08:00:00.000Z',
      updated_at: '2026-05-05T08:00:00.000Z',
    });
    db.settings.theme = 'light';
    db.settings.telegram.bot_token = 'token';
    db.settings.auto_check.enabled = true;
    db.settings.auto_check.interval_minutes = 60;
    db.subscription.plan_id = 'standard';

    await writeLocalDb(db, rootPath);
    const reloaded = await readLocalDb(rootPath);

    expect(reloaded.projects).toHaveLength(1);
    expect(reloaded.projects[0].name).toBe('Alpha');
    expect(reloaded.applications).toHaveLength(1);
    expect(reloaded.applications[0].application_number).toBe('285702690');
    expect(reloaded.applications[0].sync_state).toBe('idle');
    expect(reloaded.settings.theme).toBe('light');
    expect(reloaded.settings.telegram.bot_token).toBe('token');
    expect(reloaded.settings.auto_check.enabled).toBe(true);
    expect(reloaded.settings.auto_check.interval_minutes).toBe(60);
    expect(reloaded.subscription.plan_id).toBe('standard');
  });

  it('the _options parameter is a no-op in SQLite mode (backwards compat)', async () => {
    const db = createDefaultLocalDb();
    db.subscription.plan_id = 'standard';

    // renameImpl is now ignored — writeLocalDb should succeed without throwing
    await expect(
      writeLocalDb(db, rootPath, {
        renameImpl: async () => {
          throw Object.assign(new Error('Permission denied'), { code: 'EPERM' });
        },
      })
    ).resolves.toBeUndefined();

    const reloaded = await readLocalDb(rootPath);
    expect(reloaded.subscription.plan_id).toBe('standard');
  });

  it('applies sound_enabled SQLite migration for existing databases missing the column', async () => {
    // Bootstrap db (creates table without sound_enabled in old version scenario)
    await readLocalDb(rootPath);

    // Write and reload — migration should have added sound_enabled defaulting to true
    const db = await readLocalDb(rootPath);
    expect(typeof db.settings.sound_enabled).toBe('boolean');
    expect(db.settings.sound_enabled).toBe(true);
  });
});
