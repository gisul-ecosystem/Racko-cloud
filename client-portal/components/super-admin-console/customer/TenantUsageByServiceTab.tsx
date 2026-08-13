'use client';

import { useMemo, useState } from 'react';
import type { ServiceCatalogItem } from '@/lib/serviceCatalogApi';
import type { ServiceKey, TenantServiceConfig } from '@/lib/tenantTypes';
import {
  TENANT_SERVICE_ORDER,
  getTenantUsageCountForService,
  type TenantUsageBundle,
} from '@/lib/tenantServiceConsole';
import { TenantServiceUsagePanel } from './TenantServiceUsagePanel';

export function TenantUsageByServiceTab({
  tenantId,
  usage,
  services,
  catalog,
}: {
  tenantId: string;
  usage: TenantUsageBundle;
  services: TenantServiceConfig[];
  catalog: ServiceCatalogItem[];
}) {
  const serviceMeta = useMemo(() => {
    const labelMap = new Map(catalog.map((c) => [c.key, c.label]));
    const statusMap = new Map(services.map((s) => [s.serviceKey, s.status]));
    return TENANT_SERVICE_ORDER.filter(
      (key) => key !== 'vm-management' && (labelMap.has(key) || statusMap.has(key))
    ).map((key) => ({
      key,
      label: labelMap.get(key) || key,
      status: statusMap.get(key) ?? ('none' as const),
      count: getTenantUsageCountForService(key, usage),
    }));
  }, [catalog, services, usage]);

  const withData = serviceMeta.filter((s) => s.status === 'active' || s.count > 0);

  const [activeKey, setActiveKey] = useState<ServiceKey | null>(withData[0]?.key ?? null);

  const selected = withData.find((s) => s.key === activeKey) ?? withData[0];

  if (withData.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-900">No usage yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Allow services and create resources on the Services tab. Orders, cloud labs, and other
          usage will appear here grouped by service.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {withData.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActiveKey(s.key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              selected?.key === s.key
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.label}
            <span className="ml-1.5 text-gray-400">({s.count})</span>
          </button>
        ))}
      </div>

      {selected ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">{selected.label}</h2>
            <p className="text-xs text-gray-500">
              {selected.status === 'active' ? 'Service allowed' : 'Service not active'} ·{' '}
              {selected.count} resource{selected.count === 1 ? '' : 's'}
            </p>
          </div>
          <TenantServiceUsagePanel
            serviceKey={selected.key}
            tenantId={tenantId}
            usage={usage}
            serviceActive={selected.status === 'active'}
            showActions={false}
          />
        </section>
      ) : null}
    </div>
  );
}
