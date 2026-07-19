'use client';

import type { ReactNode } from 'react';
import type { ServiceKey } from '@/lib/tenantTypes';

interface ServiceConfigSummaryProps {
  serviceKey: ServiceKey;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown>;
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : String(value);
}

function formatInrPerMonth(value: unknown, unit: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString()} / ${unit} / mo` : String(value);
}

function formatInrAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString()}/mo` : String(value);
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2 last:border-0 last:pb-0 first:pt-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function VmManagementLimitsSummary({ limits }: { limits: Record<string, unknown> }) {
  const allowed = limits['allowedTemplateIds'];
  const allowedIds = Array.isArray(allowed) ? allowed : [];
  const templateLabel =
    allowedIds.length === 0
      ? 'All enabled platform templates'
      : `${allowedIds.length} template${allowedIds.length === 1 ? '' : 's'} (${allowedIds.join(', ')})`;

  return (
    <dl>
      <StatRow label="Max VMs" value={formatNumber(limits['maxVms'])} />
      <StatRow label="Max total vCPU" value={formatNumber(limits['maxTotalVcpu'])} />
      <StatRow label="Max total RAM" value={`${formatNumber(limits['maxTotalRamGb'])} GB`} />
      <StatRow label="Max total disk" value={`${formatNumber(limits['maxTotalDiskGb'])} GB`} />
      <StatRow label="Template access" value={templateLabel} />
    </dl>
  );
}

function VmManagementPricingSummary({ pricing, limits }: { pricing: Record<string, unknown>; limits: Record<string, unknown> }) {
  const templatePricingRaw = pricing['templatePricing'];
  const hasTemplatePricing =
    templatePricingRaw &&
    typeof templatePricingRaw === 'object' &&
    !Array.isArray(templatePricingRaw) &&
    Object.keys(templatePricingRaw as object).length > 0;

  // Build a map of templateId -> name from limits.allowedTemplateIds if available
  // (names aren't stored in pricing, so we show ID-based labels)
  const allowedIds = Array.isArray(limits['allowedTemplateIds'])
    ? (limits['allowedTemplateIds'] as number[])
    : [];

  if (hasTemplatePricing) {
    const map = templatePricingRaw as Record<string, Record<string, unknown>>;
    const entries = Object.entries(map);

    return (
      <div className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-xs text-gray-500">No per-template pricing configured yet.</p>
        ) : (
          entries.map(([templateId, p]) => {
            const qDisc = (p['billingDiscounts'] as Record<string, unknown> | undefined)?.['quarterly'];
            const yDisc = (p['billingDiscounts'] as Record<string, unknown> | undefined)?.['yearly'];
            const qPct = Number(qDisc ?? 0) * 100;
            const yPct = Number(yDisc ?? 0) * 100;

            return (
              <div
                key={templateId}
                className="rounded-md border border-gray-100 bg-white px-3 py-2.5 text-xs"
              >
                <p className="mb-1.5 font-semibold text-gray-800">
                  Template ID {templateId}
                  {allowedIds.length > 0 && !allowedIds.includes(Number(templateId)) && (
                    <span className="ml-1.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-orange-600">
                      not in allowlist
                    </span>
                  )}
                </p>
                <dl className="space-y-1">
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">CPU</dt>
                    <dd className="font-medium text-gray-800">
                      {formatInrPerMonth(p['cpuRatePerCoreMonthly'], 'core')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">RAM</dt>
                    <dd className="font-medium text-gray-800">
                      {formatInrPerMonth(p['ramRatePerGbMonthly'], 'GB')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">Disk</dt>
                    <dd className="font-medium text-gray-800">
                      {formatInrPerMonth(p['diskRatePerGbMonthly'], 'GB')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-1">
                    <dt className="text-gray-500">Quarterly discount</dt>
                    <dd className="font-medium text-gray-800">
                      {qPct > 0 ? `${Math.round(qPct)}%` : '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">Yearly discount</dt>
                    <dd className="font-medium text-gray-800">
                      {yPct > 0 ? `${Math.round(yPct)}%` : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })
        )}
      </div>
    );
  }

  // Fallback: legacy flat pricing display
  const fixedPlans = Array.isArray(pricing['fixedPlans']) ? pricing['fixedPlans'] : [];
  return (
    <>
      <dl>
        <StatRow label="CPU" value={formatInrPerMonth(pricing['cpuRatePerCoreMonthly'], 'core')} />
        <StatRow label="RAM" value={formatInrPerMonth(pricing['ramRatePerGbMonthly'], 'GB')} />
        <StatRow label="Disk" value={formatInrPerMonth(pricing['diskRatePerGbMonthly'], 'GB')} />
        <StatRow
          label="Quarterly discount"
          value={
            Number(
              pricing['billingDiscounts'] &&
                typeof pricing['billingDiscounts'] === 'object' &&
                (pricing['billingDiscounts'] as Record<string, unknown>)['quarterly']
            ) > 0
              ? `${Math.round(Number((pricing['billingDiscounts'] as Record<string, unknown>)['quarterly']) * 100)}%`
              : '—'
          }
        />
        <StatRow
          label="Yearly discount"
          value={
            Number(
              pricing['billingDiscounts'] &&
                typeof pricing['billingDiscounts'] === 'object' &&
                (pricing['billingDiscounts'] as Record<string, unknown>)['yearly']
            ) > 0
              ? `${Math.round(Number((pricing['billingDiscounts'] as Record<string, unknown>)['yearly']) * 100)}%`
              : '—'
          }
        />
      </dl>
      {fixedPlans.length > 0 ? (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-600">Fixed plans</p>
          <div className="space-y-2">
            {fixedPlans.map((plan, idx) => {
              if (!plan || typeof plan !== 'object') return null;
              const p = plan as Record<string, unknown>;
              return (
                <div
                  key={String(p['name'] ?? idx)}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs"
                >
                  <p className="font-medium text-gray-900">{String(p['name'] ?? 'Plan')}</p>
                  <p className="mt-0.5 text-gray-500">
                    {formatNumber(p['cpuCores'])} vCPU · {formatNumber(p['memoryGb'])} GB RAM ·{' '}
                    {formatNumber(p['diskGb'])} GB disk
                  </p>
                  <p className="mt-1 font-medium text-gray-800">{formatInrAmount(p['priceMonthly'])}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500">
          No fixed plans — orders use template baseline + rates above.
        </p>
      )}
    </>
  );
}

function GenericKeyValueSummary({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No configuration set.</p>;
  }

  return (
    <dl>
      {entries.map(([key, value]) => (
        <StatRow
          key={key}
          label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
          value={
            typeof value === 'object' ? (
              <span className="font-mono text-xs">{JSON.stringify(value)}</span>
            ) : (
              String(value)
            )
          }
        />
      ))}
    </dl>
  );
}

export function ServiceConfigSummary({ serviceKey, limits, pricing }: ServiceConfigSummaryProps) {
  const isVmManagement = serviceKey === 'vm-management';

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryCard title="Limits">
        {isVmManagement ? (
          <VmManagementLimitsSummary limits={limits} />
        ) : (
          <GenericKeyValueSummary data={limits} />
        )}
      </SummaryCard>
      <SummaryCard title="Pricing">
        {isVmManagement ? (
          <VmManagementPricingSummary pricing={pricing} limits={limits} />
        ) : (
          <GenericKeyValueSummary data={pricing} />
        )}
      </SummaryCard>
    </div>
  );
}
