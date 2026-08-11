'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export type DirectoryCardRow = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

export function CustomerDirectoryCard({
  href,
  title,
  subtitle,
  typeBadge,
  extraBadges,
  statusBadge,
  rows,
  highlightRow,
  footerActions,
  footerText = 'View billing, services, and usage →',
}: {
  href: string;
  title: string;
  subtitle?: string;
  typeBadge: { label: string; className: string };
  extraBadges?: ReactNode;
  statusBadge: ReactNode;
  rows: DirectoryCardRow[];
  highlightRow?: DirectoryCardRow;
  footerActions?: ReactNode;
  footerText?: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeBadge.className}`}
            >
              {typeBadge.label}
            </span>
            {extraBadges}
          </div>
        </div>
        {statusBadge}
      </div>

      <dl className="flex-1 space-y-2 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-gray-500">{row.label}</dt>
            <dd className={`text-right text-gray-700 ${row.valueClassName ?? ''}`}>{row.value}</dd>
          </div>
        ))}

        {highlightRow ? (
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
            <dt className="text-gray-500">{highlightRow.label}</dt>
            <dd
              className={`font-semibold text-gray-900 ${highlightRow.valueClassName ?? ''}`}
            >
              {highlightRow.value}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs font-medium text-[#B91C1C]">
        <span>{footerText}</span>
        {footerActions}
      </div>
    </Link>
  );
}

/** Active / inactive pill matching org customer cards. */
export function directoryActiveStatusBadge(isActive: boolean) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

/** Tenant lifecycle status using the same pill style as customer cards. */
export function directoryTenantStatusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'active') {
    return directoryActiveStatusBadge(true);
  }
  if (normalized === 'pending') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium capitalize text-amber-700">
        Pending
      </span>
    );
  }
  if (normalized === 'suspended') {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Suspended
      </span>
    );
  }
  if (normalized === 'cancelled') {
    return directoryActiveStatusBadge(false);
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
      {status.replace(/_/g, ' ')}
    </span>
  );
}
