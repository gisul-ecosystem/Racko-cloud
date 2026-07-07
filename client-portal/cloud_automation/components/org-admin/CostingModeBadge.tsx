'use client';

import type { CostingMode } from '../../types/catalog';

interface CostingModeBadgeProps {
  mode: CostingMode | string | null | undefined;
  size?: 'sm' | 'md';
}

export function CostingModeBadge({ mode, size = 'sm' }: CostingModeBadgeProps) {
  const normalized = String(mode || 'shared').toLowerCase();
  const isPerUser = normalized === 'per_user';

  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  if (isPerUser) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 font-medium text-violet-800 ${sizeClass}`}
        title="Each user has a dedicated Azure resource group"
      >
        Per-user RG
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 font-medium text-slate-700 ${sizeClass}`}
      title="All users share one Azure resource group"
    >
      Shared RG
    </span>
  );
}
