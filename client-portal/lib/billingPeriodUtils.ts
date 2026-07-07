import type { BillingDiscounts, BillingPeriod } from '@/types/tenantPortal';
import { formatBillingPeriod } from '@/lib/tenantPlanUtils';

export { formatBillingPeriod };

export function billingPeriodHelperText(
  period: BillingPeriod,
  discounts?: BillingDiscounts | null
): string | null {
  if (period === 'quarterly') {
    const pct = discounts?.quarterly ? Math.round(discounts.quarterly * 100) : 0;
    return pct > 0
      ? `${pct}% off vs paying monthly · billed every 3 months`
      : 'Billed every 3 months';
  }
  if (period === 'yearly') {
    const pct = discounts?.yearly ? Math.round(discounts.yearly * 100) : 0;
    return pct > 0
      ? `${pct}% off vs paying monthly · billed annually`
      : 'Billed annually';
  }
  return null;
}

export function parseBillingDiscounts(
  raw: unknown
): BillingDiscounts {
  if (!raw || typeof raw !== 'object') {
    return { quarterly: 0, yearly: 0 };
  }
  const d = raw as Record<string, unknown>;
  return {
    quarterly: Math.min(1, Math.max(0, Number(d.quarterly) || 0)),
    yearly: Math.min(1, Math.max(0, Number(d.yearly) || 0)),
  };
}
