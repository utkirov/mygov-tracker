import { connection, NextRequest, NextResponse } from 'next/server';

import { loadAnalytics } from '@/lib/analytics';

/**
 * Terms, stage durations, commissions, rejection reasons and forecasts (lib/analytics.ts).
 * `?months=3|6|12` — only applications submitted in that period; `?personal=0` — without
 * private errands. No parameters — the whole history (what the app and other pages use).
 */
export async function GET(request: NextRequest) {
  await connection();
  const q = request.nextUrl.searchParams;
  const months = Number.parseInt(q.get('months') ?? '', 10);
  const options = {
    months: Number.isFinite(months) && months > 0 && months <= 120 ? months : null,
    includePersonal: q.get('personal') !== '0',
  };
  return NextResponse.json(await loadAnalytics(undefined, new Date(), options));
}
