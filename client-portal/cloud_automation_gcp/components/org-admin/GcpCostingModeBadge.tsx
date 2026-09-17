'use client';

import type { GcpCostingMode } from '../../types/orgAdmin';

interface GcpCostingModeBadgeProps {
  mode: GcpCostingMode | string | null | undefined;
}

export function GcpCostingModeBadge({ mode }: GcpCostingModeBadgeProps) {
  const normalized = String(mode || 'shared').toLowerCase();
  const isPerUser = normalized === 'per_user';

  if (isPerUser) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800"
        title="Each user has dedicated IAM access"
      >
        Per-user
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
      title="Shared lab access model"
    >
      Shared
    </span>
  );
}
