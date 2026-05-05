import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb, writeLocalDb, type LocalPlanId } from '@/lib/local-db';

const VALID_PLANS: LocalPlanId[] = ['free', 'standard', 'pro'];

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let userId: string | undefined;
  let planId: string | undefined;
  let expiresAt: string | undefined;

  try {
    ({ userId, planId, expiresAt } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!planId) {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 });
  }

  if (!VALID_PLANS.includes(planId as LocalPlanId)) {
    return NextResponse.json(
      { error: `planId must be one of: ${VALID_PLANS.join(', ')}` },
      { status: 400 }
    );
  }

  const db = await readLocalDb();
  db.subscription = {
    plan_id: planId as LocalPlanId,
    status: 'active',
    expires_at: expiresAt ?? null,
    updated_at: new Date().toISOString(),
  };
  db.meta.updated_at = db.subscription.updated_at;

  await writeLocalDb(db);

  return NextResponse.json({
    ok: true,
    userId: userId ?? null,
    planId: db.subscription.plan_id,
    expiresAt: db.subscription.expires_at,
  });
}
