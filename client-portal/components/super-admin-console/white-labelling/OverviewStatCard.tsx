'use client';

import type { LucideIcon } from 'lucide-react';

interface OverviewStatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: 'red' | 'green' | 'amber' | 'blue' | 'purple';
}

const accentMap: Record<
  OverviewStatCardProps['accent'],
  { bg: string; icon: string; value: string }
> = {
  red: { bg: 'bg-red-50', icon: 'text-[#B91C1C]', value: 'text-[#B91C1C]' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', value: 'text-green-700' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600', value: 'text-amber-700' },
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', value: 'text-blue-700' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', value: 'text-violet-700' },
};

export function OverviewStatCard({ label, value, icon: Icon, accent }: OverviewStatCardProps) {
  const styles = accentMap[accent];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles.bg}`}>
          <Icon className={`h-4 w-4 ${styles.icon}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold leading-none ${styles.value}`}>{value}</p>
    </div>
  );
}
