import { createSupabaseServer, getUser } from './supabase-server';
import { getPlan, type Plan, type PlanId } from './plans';
import type { User } from '@supabase/supabase-js';

export async function getUserPlan(user?: User | null): Promise<Plan> {
  const resolvedUser = user !== undefined ? user : await getUser();
  if (!resolvedUser) return getPlan('free');

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id, status, expires_at')
    .eq('user_id', resolvedUser.id)
    .single();

  if (!data || data.status !== 'active') return getPlan('free');
  if (data.expires_at && new Date(data.expires_at) < new Date()) return getPlan('free');
  return getPlan(data.plan_id as PlanId);
}
