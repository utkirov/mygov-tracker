export type PlanId = 'free' | 'standard' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;           // in UZS
  maxApplications: number; // -1 = unlimited
  maxProjects: number;     // -1 = unlimited, 0 = disabled
  telegramEnabled: boolean;
  autoCheckInterval: number; // minutes, 0 = disabled
  archiveEnabled: boolean;
  color: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Бесплатный',
    price: 0,
    maxApplications: 3,
    maxProjects: 0,
    telegramEnabled: false,
    autoCheckInterval: 0,
    archiveEnabled: false,
    color: '#636366',
  },
  standard: {
    id: 'standard',
    name: 'Стандарт',
    price: 49900,
    maxApplications: 30,
    maxProjects: 5,
    telegramEnabled: true,
    autoCheckInterval: 60,
    archiveEnabled: true,
    color: '#0071e3',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 149900,
    maxApplications: -1,
    maxProjects: -1,
    telegramEnabled: true,
    autoCheckInterval: 15,
    archiveEnabled: true,
    color: '#af52de',
  },
};

export function getPlan(id: PlanId | null | undefined): Plan {
  return PLANS[id ?? 'free'] ?? PLANS.free;
}

export function canAddApplication(plan: Plan, currentCount: number): boolean {
  return plan.maxApplications === -1 || currentCount < plan.maxApplications;
}

export function canAddProject(plan: Plan, currentCount: number): boolean {
  if (plan.maxProjects === 0) return false;
  return plan.maxProjects === -1 || currentCount < plan.maxProjects;
}
