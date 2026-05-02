import { createSupabaseServer, getUser } from './supabase-server';
import { getPlan, type Plan, type PlanId } from './plans';

export async function getUserPlan(): Promise<Plan> {
  const user = await getUser();
  if (!user) return getPlan('free');

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id, status, expires_at')
    .eq('user_id', user.id)
    .single();

  if (!data || data.status !== 'active') return getPlan('free');
  if (data.expires_at && new Date(data.expires_at) < new Date()) return getPlan('free');
  return getPlan(data.plan_id as PlanId);
}
