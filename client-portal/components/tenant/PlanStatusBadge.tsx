'use client';

import type { TenantPlan } from '@/types/tenantPortal';
import { getPlanDisplayStatus } from '@/lib/tenantPlanUtils';

const config = {
  active: {
    label: 'Active',
    badge: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
  },
  expiring_soon: {
    label: 'Expiring soon',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
  },
  expired: {
    label: 'Expired',
    badge: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
} as const;

export function PlanStatusBadge({ plan }: { plan: Pick<TenantPlan, 'planStatus' | 'planPeriodEnd'> }) {
  const status = getPlanDisplayStatus(plan);
  const cfg = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
