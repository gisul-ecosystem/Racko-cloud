'use client';

import { Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface PricingSummaryProps {
  totalPrice: number | null;
  currency?: string;
  duration?: number;
  accountCount?: number;
  loading: boolean;
  error: string | null;
}

export function PricingSummary({
  totalPrice,
  currency = 'USD',
  duration,
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
            {(duration != null || accountCount != null) && (
              <p className="text-xs text-gray-500">
                {accountCount != null && `${accountCount} account${accountCount !== 1 ? 's' : ''}`}
                {accountCount != null && duration != null && ' · '}
                {duration != null && `${duration} day${duration !== 1 ? 's' : ''}`}
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
