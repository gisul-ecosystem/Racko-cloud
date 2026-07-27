'use client';

import { DollarSign, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../../cloud_automation/utils/formatters';

function formatDurationHours(hours) {
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} hour${rounded !== 1 ? 's' : ''}`;
  }

  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} day${days !== 1 ? 's' : ''} (${Math.round(hours)} hrs)`;
}

export function PricingSummary({
  totalPrice,
  breakdown = [],
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
}) {
  const effectiveHours = billableHours ?? durationHours;
  const pricedLines = breakdown.filter((entry) => entry.cost > 0 || entry.flatRate);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-0.5 bg-gradient-to-r from-[var(--cloud-accent,#B91C1C)] to-[var(--cloud-accent,#B91C1C)]" />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Pricing estimate</h2>
            <p className="text-xs text-gray-400">Updates as you configure the request</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--cloud-accent,#B91C1C)]" />
            Calculating…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : totalPrice != null ? (
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-bold tracking-tight text-[var(--cloud-accent,#B91C1C)]">
                {formatCurrency(totalPrice)}
                <span className="ml-1.5 text-sm font-normal text-gray-400">USD</span>
              </p>
              {(accountCount != null || effectiveHours != null) && (
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
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
            </div>

            {baseHourlyPrice != null ? (
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
                        ? `${formatCurrency(portalHourlyTotal)} usage`
                        : null,
                      infraHourlyTotal != null && infraHourlyTotal > 0
                        ? `${formatCurrency(infraHourlyTotal)} AWS infra`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' + ')}
                    )
                  </>
                ) : null}
              </div>
            ) : null}

            {pricedLines.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Cost breakdown
                </p>
                <div className="space-y-2 border-t border-gray-100 pt-2">
                  {pricedLines.map((entry) => {
                    const isSharedInfra =
                      !entry.flatRate && Number(entry.accountMultiplier || 1) === 1;
                    return (
                      <div
                        key={`${entry.serviceName}-${entry.instanceType}`}
                        className="flex items-start justify-between gap-3 text-xs"
                      >
                        <span className="text-gray-600">
                          {entry.serviceName} {entry.label || entry.instanceType}
                          {isSharedInfra
                            ? ` × ${formatDurationHours(entry.durationHours ?? effectiveHours ?? 0)} (shared)`
                            : ` × ${entry.accountCount} user${entry.accountCount !== 1 ? 's' : ''} × ${formatDurationHours(entry.durationHours ?? effectiveHours ?? 0)}`}
                          {entry.flatRate || entry.estimated ? ' (lab est.)' : ''}
                        </span>
                        <span className="shrink-0 font-medium text-gray-900">
                          {formatCurrency(entry.cost)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <p className="text-xs leading-relaxed text-gray-400">
              Shared labs bill AWS compute once; usage-based services scale with accounts. Actual AWS
              charges may differ from lab estimates.
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
