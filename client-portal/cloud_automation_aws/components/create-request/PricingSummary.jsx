'use client';

import { DollarSign, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../../cloud_automation/utils/formatters';

export function PricingSummary({
  totalPrice,
  breakdown = [],
  duration,
  accountCount,
  loading,
  error,
}) {
  const pricedLines = breakdown.filter((entry) => entry.cost > 0 || entry.flatRate);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-0.5 bg-gradient-to-r from-[#B91C1C] to-[#DC2626]" />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Pricing estimate</h2>
            <p className="text-xs text-gray-400">Updates as you configure the request</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
            Calculating…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : totalPrice != null ? (
          <div className="space-y-4">
            {pricedLines.length > 0 ? (
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
                        {entry.serviceName} {entry.instanceType}
                        {entry.flatRate
                          ? ` × ${entry.durationDays} day${entry.durationDays !== 1 ? 's' : ''}`
                          : ` × ${entry.accountCount} user${entry.accountCount !== 1 ? 's' : ''} × ${entry.durationDays} day${entry.durationDays !== 1 ? 's' : ''}`}
                      </span>
                      <span className="shrink-0 font-medium text-gray-900">
                        {formatCurrency(entry.cost)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-end justify-between border-t border-gray-100 pt-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Estimated total
                </p>
                {(duration != null || accountCount != null) && (
                  <p className="mt-1 text-xs text-gray-500">
                    {accountCount != null && `${accountCount} account${accountCount !== 1 ? 's' : ''}`}
                    {accountCount != null && duration != null && ' · '}
                    {duration != null && `${duration} day${duration !== 1 ? 's' : ''}`}
                  </p>
                )}
              </div>
              <p className="text-2xl font-bold text-[#B91C1C]">{formatCurrency(totalPrice)}</p>
            </div>

            <p className="text-xs leading-relaxed text-gray-400">
              Flat-rate services (S3, Lambda) are estimated. Actual cost depends on usage.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Select services, region, and dates to see an estimate.
          </p>
        )}
      </div>
    </section>
  );
}
