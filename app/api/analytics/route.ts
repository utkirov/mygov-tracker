import { connection, NextResponse } from 'next/server';

import { loadAnalytics } from '@/lib/analytics';

/** Terms, stage durations, commissions, rejection reasons and forecasts (lib/analytics.ts). */
export async function GET() {
  await connection();
  return NextResponse.json(await loadAnalytics());
}
