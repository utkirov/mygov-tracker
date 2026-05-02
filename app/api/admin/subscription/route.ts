import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // service role client

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let userId: string, planId: string, expiresAt: string | undefined;
  try {
    ({ userId, planId, expiresAt } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!userId || !planId) {
    return NextResponse.json({ error: 'userId и planId обязательны' }, { status: 400 });
  }

  const validPlans = ['free', 'standard', 'pro'];
  if (!validPlans.includes(planId)) {
    return NextResponse.json({ error: `planId must be one of: ${validPlans.join(', ')}` }, { status: 400 });
  }

  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan_id: planId,
    status: 'active',
    expires_at: expiresAt ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, userId, planId, expiresAt: expiresAt ?? null });
}
