'use client';

import { Loader2 } from 'lucide-react';
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Pricing estimate</h2>
      <p className="mt-0.5 text-xs text-gray-400">Updates automatically as you configure the request</p>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
            Calculating…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : totalPrice != null ? (
          <div className="space-y-2">
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(totalPrice)}
              <span className="ml-1 text-sm font-normal text-gray-400">{currency}</span>
            </p>
            {(accountCount != null || effectiveHours != null) && (
              <p className="text-xs text-gray-500">
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
              <p className="text-xs text-gray-500">
                {formatCurrency(baseHourlyPrice)}/hr lab rate
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
                    {accountCount != null && accountCount > 1 ? ` × ${accountCount} accounts` : ''})
                  </>
                ) : null}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Select services, region, and dates to see an estimate.
          </p>
        )}
      </div>
    </div>
  );
}
