import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import { readAutoCheckSettings } from '@/lib/local-db';
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
  const autoCheck = await readAutoCheckSettings();
  const persistedScheduler = await readPersistedSchedulerStatus();

  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    autoCheck: {
      enabled: autoCheck.enabled,
      intervalMinutes: autoCheck.interval_minutes,
      delayBetweenChecksMs: autoCheck.delay_between_checks_ms,
      concurrencyLimit: autoCheck.concurrency_limit,
    },
    scheduler: persistedScheduler ?? getServerSchedulerStatus(),
  });
}
