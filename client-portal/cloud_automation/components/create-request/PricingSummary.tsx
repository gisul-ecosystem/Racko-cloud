'use client';

import { Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface PricingSummaryProps {
  totalPrice: number | null;
  currency?: string;
  durationHours?: number;
  accountCount?: number;
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
  accountCount,
  loading,
  error,
}: PricingSummaryProps) {
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
            {(durationHours != null || accountCount != null) && (
              <p className="text-xs text-gray-500">
                {accountCount != null && `${accountCount} account${accountCount !== 1 ? 's' : ''}`}
                {accountCount != null && durationHours != null && ' · '}
                {durationHours != null && formatDurationHours(durationHours)}
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
