'use client';

import { Loader2 } from 'lucide-react';
import { formatCurrency } from '../../../cloud_automation/utils/formatters';

export function PricingSummary({
  totalPrice,
  breakdown = [],
  duration,
  accountCount,
  loading,
  error,
}) {
  const pricedLines = breakdown.filter((entry) => !entry.flatRate && entry.cost > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Pricing estimate</h2>
      <p className="mt-0.5 text-xs text-gray-400">Updates automatically</p>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
            Calculating…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : totalPrice != null ? (
          <div className="space-y-4">
            {pricedLines.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Cost breakdown
                </p>
                <div className="space-y-2 border-t border-gray-100 pt-2">
                  {pricedLines.map((entry) => (
                    <div
                      key={`${entry.serviceName}-${entry.instanceType}`}
                      className="flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-gray-600">
                        {entry.serviceName} {entry.instanceType} × {entry.accountCount} user
                        {entry.accountCount !== 1 ? 's' : ''} × {entry.durationDays} day
                        {entry.durationDays !== 1 ? 's' : ''}
                      </span>
                      <span className="shrink-0 font-medium text-gray-900">
                        {formatCurrency(entry.cost)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                  <span className="text-sm font-semibold text-gray-900">Estimated total</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(totalPrice)}</span>
                </div>
              </div>
            )}
            {pricedLines.length === 0 && (
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalPrice)}</p>
            )}
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
