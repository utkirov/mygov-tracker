import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDefaultLocalDb, writeLocalDb } from '../local-db';
import { closeDb } from '../sqlite-db';
import { getUserPlan } from '../subscription';

// getUserPlan() always reads via the default (env-resolved) root, so these
// tests point LOCAL_APP_ROOT at a scratch dir instead of passing rootPath directly.
describe('subscription getUserPlan', () => {
  let rootPath: string;
  const originalRoot = process.env.LOCAL_APP_ROOT;
  const originalForcedPlan = process.env.DEV_FORCE_PLAN;

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'subscription-test-'));
    process.env.LOCAL_APP_ROOT = rootPath;
    delete process.env.DEV_FORCE_PLAN;
  });

  afterEach(async () => {
    closeDb(); // reset singleton so next test/rootPath gets a fresh connection
    await rm(rootPath, { recursive: true, force: true });

    if (originalRoot === undefined) delete process.env.LOCAL_APP_ROOT;
    else process.env.LOCAL_APP_ROOT = originalRoot;

    if (originalForcedPlan === undefined) delete process.env.DEV_FORCE_PLAN;
    else process.env.DEV_FORCE_PLAN = originalForcedPlan;
  });

  it('fails closed (treats as expired) when expires_at is an unparseable date', async () => {
    const db = createDefaultLocalDb();
    db.subscription = {
      plan_id: 'pro',
      status: 'active',
      expires_at: 'not-a-real-date',
      updated_at: null,
    };
    await writeLocalDb(db);

    const plan = await getUserPlan();

    expect(plan.id).toBe('free');
  });

  it('keeps the plan active when expires_at is a valid future date', async () => {
    const db = createDefaultLocalDb();
    db.subscription = {
      plan_id: 'pro',
      status: 'active',
      expires_at: '2099-01-01T00:00:00.000Z',
      updated_at: null,
    };
    await writeLocalDb(db);

    const plan = await getUserPlan();

    expect(plan.id).toBe('pro');
  });

  it('expires the plan when expires_at is a valid past date', async () => {
    const db = createDefaultLocalDb();
    db.subscription = {
      plan_id: 'pro',
      status: 'active',
      expires_at: '2000-01-01T00:00:00.000Z',
      updated_at: null,
    };
    await writeLocalDb(db);

    const plan = await getUserPlan();

    expect(plan.id).toBe('free');
  });
});
