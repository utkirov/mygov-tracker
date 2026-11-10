import { connection, NextResponse } from 'next/server';

import { DOWNTIME_THRESHOLD_MIN, listDowntimes } from '@/lib/downtime';

/** Periods when the tracker's server was off (lib/downtime.ts) — newest first. */
export async function GET() {
  await connection();
  return NextResponse.json({ thresholdMinutes: DOWNTIME_THRESHOLD_MIN, downtimes: await listDowntimes() });
}
