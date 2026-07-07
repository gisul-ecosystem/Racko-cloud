'use client';

import type { TenantOrderStatus } from '@/types/tenantPortal';

const statusConfig: Record<
  TenantOrderStatus,
  { label: string; dot: string; badge: string }
> = {
  pending_payment: {
    label: 'Pending payment',
    dot: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  pending_approval: {
    label: 'Pending approval',
    dot: 'bg-blue-400',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  approved: {
    label: 'Approved',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 border-green-200',
  },
  provisioning: {
    label: 'Provisioning',
    dot: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  rejected: {
    label: 'Rejected',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
  fulfilled: {
    label: 'Fulfilled',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 border-green-200',
  },
};

export function OrderStatusBadge({ status }: { status: TenantOrderStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.pending_approval;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
