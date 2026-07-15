'use client';

import { DollarSign, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface PricingSummaryProps {
  totalPrice: number | null;
  currency?: string;
  durationHours?: number;
  calendarHours?: number;
  billableHours?: number;
  usesUsageWindows?: boolean;
  accountCount?: number;
  baseHourlyPrice?: number;
  portalHourlyTotal?: number;
  infraHourlyTotal?: number;
  loading: boolean;
  error: string | null;
}

function formatDurationHours(hours: number): string {
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} hour${rounded !== 1 ? 's' : ''}`;
  }

  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} day${days !== 1 ? 's' : ''} (${Math.round(hours)} hrs)`;
}

export function PricingSummary({
  totalPrice,
  currency = 'USD',
  durationHours,
  calendarHours,
  billableHours,
  usesUsageWindows,
  accountCount,
  baseHourlyPrice,
  portalHourlyTotal,
  infraHourlyTotal,
  loading,
  error,
}: PricingSummaryProps) {
  const effectiveHours = billableHours ?? durationHours;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]">
            <DollarSign className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Pricing estimate</h2>
            <p className="text-xs text-gray-400">Updates as you configure the request</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--cloud-accent,#B91C1C)]" />
            Calculating…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : totalPrice != null ? (
          <div className="space-y-3">
            <p className="text-3xl font-bold tracking-tight text-[var(--cloud-accent,#B91C1C)]">
              {formatCurrency(totalPrice)}
              <span className="ml-1.5 text-sm font-normal text-gray-400">{currency}</span>
            </p>
            {(accountCount != null || effectiveHours != null) && (
              <p className="text-xs leading-relaxed text-gray-500">
                {accountCount != null && `${accountCount} account${accountCount !== 1 ? 's' : ''}`}
                {accountCount != null && effectiveHours != null && ' · '}
                {effectiveHours != null && formatDurationHours(effectiveHours)}
                {usesUsageWindows && calendarHours != null && calendarHours !== effectiveHours
                  ? ` (of ${Math.round(calendarHours)} calendar hrs)`
                  : !usesUsageWindows
                    ? ' · assumes 24/7 access'
                    : ''}
              </p>
            )}
            {baseHourlyPrice != null && (
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                <span className="font-medium text-gray-700">
                  {formatCurrency(baseHourlyPrice)}/hr
                </span>{' '}
                lab rate
                {portalHourlyTotal != null || infraHourlyTotal != null ? (
                  <>
                    {' '}
                    (
                    {[
                      portalHourlyTotal != null && portalHourlyTotal > 0
                        ? `${formatCurrency(portalHourlyTotal)} portal`
                        : null,
                      infraHourlyTotal != null && infraHourlyTotal > 0
                        ? `${formatCurrency(infraHourlyTotal)} Azure infra`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' + ')}
                    {accountCount != null && accountCount > 1 ? ` × ${accountCount} accounts` : ''}
                    )
                  </>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center">
            <p className="text-sm font-medium text-gray-500">No estimate yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Select services, region, and dates to see pricing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
