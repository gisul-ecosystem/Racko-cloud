'use client';

import type { TenantStatus } from '../../../lib/tenantTypes';

const statusStyles: Record<TenantStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  suspended: 'bg-orange-50 text-orange-700 border-orange-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}
