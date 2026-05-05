import { readLocalDb } from './local-db';
import { getPlan, type Plan, type PlanId } from './plans';

function resolveForcedPlan(): PlanId | null {
  const forcedPlan = process.env.DEV_FORCE_PLAN;

  if (forcedPlan === 'free' || forcedPlan === 'standard' || forcedPlan === 'pro') {
    return forcedPlan;
  }

  return null;
}

export async function getUserPlan(): Promise<Plan> {
  const forcedPlan = resolveForcedPlan();
  if (forcedPlan) return getPlan(forcedPlan);

  const { subscription } = await readLocalDb();
  if (subscription.status !== 'active') return getPlan('free');
  if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) return getPlan('free');
  return getPlan(subscription.plan_id);
}
