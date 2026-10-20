import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildDigest, runPushSchedule, waitingDays } from '../push-schedule';
import { closeDb } from '../sqlite-db';
import type { LocalDbApplication } from '../local-db';

describe('push schedule', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'push-schedule-'));
    closeDb();
  });
  afterEach(async () => {
    closeDb();
    await rm(root, { recursive: true, force: true });
  });

  it('builds a readable summary', () => {
    expect(buildDigest({ active: 12, waiting: 2, changed24h: 3, errors24h: 0, stalled: 1 })).toEqual({
      title: 'Сводка · 12 активных заявлений',
      body: '2 ждут вашего действия · 10 в обработке · за сутки изменений: 3 · без движения 14+ дней: 1',
    });
  });

  it('counts how long an application has been waiting', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const app = { last_changed_date: '2026-10-17T11:00:00Z' } as LocalDbApplication;
    expect(waitingDays(app, now)).toBe(3);
  });

  it('sends each daily push once per day, only after its hour', async () => {
    expect(await runPushSchedule(new Date(2026, 9, 20, 8, 0), root)).toEqual({});
    expect(await runPushSchedule(new Date(2026, 9, 20, 9, 5), root)).toEqual({ digestDay: '2026-10-20' });
    expect(await runPushSchedule(new Date(2026, 9, 20, 11, 0), root)).toEqual({ digestDay: '2026-10-20', reminderDay: '2026-10-20' });
    expect(await runPushSchedule(new Date(2026, 9, 21, 9, 30), root)).toEqual({ digestDay: '2026-10-21', reminderDay: '2026-10-20' });
  });
});
