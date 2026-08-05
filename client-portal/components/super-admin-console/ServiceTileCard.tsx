'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface ServiceTileCardProps {
  href: string;
  name: string;
  description: string;
  icon: LucideIcon;
  badgeCount?: number;
}

/** Reusable 200×200 service tile used on the Super Admin console landing. */
export function ServiceTileCard({
  href,
  name,
  description,
  icon: Icon,
  badgeCount = 0,
}: ServiceTileCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-center shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
    >
      {badgeCount > 0 ? (
        <span
          className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B91C1C] px-1.5 text-[11px] font-bold text-white"
          aria-label={`${badgeCount} pending`}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      ) : null}
      <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
        <Icon className="h-7 w-7" />
      </div>
      <span className="text-sm font-medium text-gray-900">{name}</span>
      <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
        {description}
      </span>
    </Link>
  );
}
