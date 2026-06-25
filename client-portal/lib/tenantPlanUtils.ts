import type { PlanStatus, TenantPlan } from '@/types/tenantPortal';

export type PlanDisplayStatus = 'active' | 'expiring_soon' | 'expired';

const EXPIRING_SOON_DAYS = 7;

export function getPlanDisplayStatus(plan: Pick<TenantPlan, 'planStatus' | 'planPeriodEnd'>): PlanDisplayStatus {
  if (plan.planStatus === 'expired') return 'expired';

  const end = new Date(plan.planPeriodEnd);
  const now = new Date();
  if (end <= now) return 'expired';

  const msUntilEnd = end.getTime() - now.getTime();
  const daysUntilEnd = msUntilEnd / (1000 * 60 * 60 * 24);
  if (daysUntilEnd <= EXPIRING_SOON_DAYS) return 'expiring_soon';

  return 'active';
}

export function daysUntilPlanEnd(planPeriodEnd: string): number {
  const end = new Date(planPeriodEnd);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatPlanPeriodEnd(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatBillingPeriod(period: string): string {
  const labels: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  };
  return labels[period] ?? period;
}

export function planExpiryLabel(plan: Pick<TenantPlan, 'planStatus' | 'planPeriodEnd'>): string {
  const display = getPlanDisplayStatus(plan);
  if (display === 'expired') {
    return `Expired on ${formatPlanPeriodEnd(plan.planPeriodEnd)}`;
  }
  const days = daysUntilPlanEnd(plan.planPeriodEnd);
  if (days <= 0) return `Expired on ${formatPlanPeriodEnd(plan.planPeriodEnd)}`;
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}
