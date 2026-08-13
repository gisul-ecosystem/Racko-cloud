'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchTenantAssignableCatalog } from '@/lib/adminServicesApi';
import type { ServiceCatalogItem } from '@/lib/serviceCatalogApi';
import {
  assignTenantService,
  fetchTenantServices,
  updateTenantService,
} from '@/lib/tenantApi';
import type {
  ServiceKey,
  TenantServiceConfig,
  VmManagementLimits,
  VmManagementPricing,
} from '@/lib/tenantTypes';
import type { TenantUsageBundle } from '@/lib/tenantServiceConsole';
import { getTenantUsageCountForService } from '@/lib/tenantServiceConsole';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { TenantServiceUsagePanel } from './TenantServiceUsagePanel';

const DEFAULT_VM_LIMITS: VmManagementLimits = {
  maxVms: 50,
  maxTotalVcpu: 200,
  maxTotalRamGb: 512,
  maxTotalDiskGb: 5000,
};

const DEFAULT_VM_PRICING: VmManagementPricing = {
  cpuRatePerCoreMonthly: 500,
  ramRatePerGbMonthly: 100,
  diskRatePerGbMonthly: 10,
  billingDiscounts: { quarterly: 0, yearly: 0 },
  fixedPlans: [],
};

type ServiceRow = {
  key: ServiceKey;
  label: string;
  description?: string;
  status: 'active' | 'suspended' | 'none';
};

export function TenantServicesTab({
  tenantId,
  usage,
  onServicesChanged,
}: {
  tenantId: string;
  usage: TenantUsageBundle;
  onServicesChanged?: () => void;
}) {
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [services, setServices] = useState<TenantServiceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<ServiceKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [servicesData, catalogData] = await Promise.all([
        fetchTenantServices(tenantId),
        fetchTenantAssignableCatalog(),
      ]);
      setServices(servicesData);
      setCatalog(catalogData.filter((item) => !isServiceHiddenFromUi(item.key)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const serviceRows: ServiceRow[] = useMemo(() => {
    const assigned = new Map(services.map((s) => [s.serviceKey, s]));
    if (catalog.length === 0) {
      return services.map((s) => ({
        key: s.serviceKey,
        label: s.serviceKey,
        status: s.status,
      }));
    }
    return catalog.map((item) => ({
      key: item.key as ServiceKey,
      label: item.label,
      description: item.description,
      status: assigned.get(item.key as ServiceKey)?.status ?? ('none' as const),
    }));
  }, [catalog, services]);

  async function allow(key: ServiceKey) {
    setBusyKey(key);
    setError(null);
    try {
      const found = services.find((s) => s.serviceKey === key);
      if (!found) {
        await assignTenantService(tenantId, {
          serviceKey: key,
          limits: key === 'vm-management' ? { ...DEFAULT_VM_LIMITS } : {},
          pricing: key === 'vm-management' ? { ...DEFAULT_VM_PRICING } : {},
        });
      } else {
        await updateTenantService(tenantId, key, { status: 'active' });
      }
      await load();
      onServicesChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to allow service.');
    } finally {
      setBusyKey(null);
    }
  }

  async function disallow(key: ServiceKey) {
    setBusyKey(key);
    setError(null);
    try {
      await updateTenantService(tenantId, key, { status: 'suspended' });
      await load();
      onServicesChanged?.();
      if (expandedKey === key) setExpandedKey(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disallow service.');
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <p className="text-sm text-gray-500">
        Allow or disallow product services for this tenant. Expand a row or click Manage to review
        usage and open Super Admin management — same controls as organization customers in the
        Customer Directory.
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="w-8 px-3 py-3" />
              <th className="px-3 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {serviceRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                  No services in catalog.
                </td>
              </tr>
            ) : (
              serviceRows.map((row) => {
                const busy = busyKey === row.key;
                const expanded = expandedKey === row.key;
                const usageCount = getTenantUsageCountForService(row.key, usage);
                return (
                  <Fragment key={row.key}>
                    <tr className="border-b border-gray-50">
                      <td className="px-3 py-3.5">
                        <button
                          type="button"
                          aria-label={expanded ? 'Collapse' : 'Expand'}
                          onClick={() => setExpandedKey(expanded ? null : row.key)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="font-medium text-gray-900">{row.label}</p>
                        {row.description ? (
                          <p className="mt-0.5 text-xs text-gray-500">{row.description}</p>
                        ) : null}
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">{row.key}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.status === 'active'
                              ? 'bg-green-50 text-green-700'
                              : row.status === 'suspended'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {row.status === 'active'
                            ? 'Allowed'
                            : row.status === 'suspended'
                              ? 'Disallowed'
                              : 'Not assigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">
                        {row.status === 'active' ? (
                          <span>
                            {usageCount} item{usageCount === 1 ? '' : 's'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          {row.status !== 'active' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void allow(row.key)}
                              className="rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {busy ? '…' : 'Allow'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void disallow(row.key)}
                              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                            >
                              {busy ? '…' : 'Disallow'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedKey(expanded ? null : row.key)}
                            className="rounded-md border border-red-100 px-2.5 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-50"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        <td colSpan={5} className="px-5 py-4">
                          <TenantServiceUsagePanel
                            serviceKey={row.key}
                            tenantId={tenantId}
                            usage={usage}
                            serviceActive={row.status === 'active'}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
