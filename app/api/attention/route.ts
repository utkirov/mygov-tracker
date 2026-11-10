import { connection, NextResponse } from 'next/server';

import { loadAnalytics } from '@/lib/analytics';

/**
 * «Требует внимания» for the board and the app's home screen — the short lists
 * out of lib/analytics.ts: slower than usual, rejected and waiting for a new
 * submission, stale.
 */
export async function GET() {
  await connection();
  const a = await loadAnalytics();
  const item = (f: (typeof a.forecasts)[number]) => ({
    applicationId: f.applicationId, application_number: f.application_number, title: f.title,
    elapsedDays: f.elapsedDays, overdueDays: f.overdueDays, stage: f.stage,
  });
  return NextResponse.json({
    slow: a.forecasts.filter(f => f.pace === 'slow' && !f.stale).map(item),
    stale: a.forecasts.filter(f => f.stale).map(item),
    awaiting: a.awaiting,
  });
}
