import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import { readLocalDb } from '@/lib/local-db';
import { getServerSchedulerStatus } from '@/lib/server-scheduler';

export const runtime = 'nodejs';

const SCHEDULER_STATUS_PATH = join(process.cwd(), 'data', 'scheduler-status.json');

async function readPersistedSchedulerStatus() {
  if (!existsSync(SCHEDULER_STATUS_PATH)) {
    return null;
  }

  try {
    const raw = await readFile(SCHEDULER_STATUS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  const db = await readLocalDb();
  const persistedScheduler = await readPersistedSchedulerStatus();

  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    autoCheck: {
      enabled: db.settings.auto_check.enabled,
      intervalMinutes: db.settings.auto_check.interval_minutes,
      delayBetweenChecksMs: db.settings.auto_check.delay_between_checks_ms,
      concurrencyLimit: db.settings.auto_check.concurrency_limit,
    },
    scheduler: persistedScheduler ?? getServerSchedulerStatus(),
  });
}
