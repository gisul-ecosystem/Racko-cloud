'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Server } from 'lucide-react';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { VMStatusBadge } from '@/components/dashboard/VMStatusBadge';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantServices } from '@/context/TenantServicesContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { ApiError } from '@/lib/apiClient';
import { fetchTenantVms } from '@/lib/tenantVmApi';
import type { TenantVmSummary } from '@/types/tenantPortal';
import type { VMStatus } from '@/lib/vmApi';

/** Recent VMs table — mirrors admin RecentResourcesTable layout for the tenant hub. */
export function TenantRecentResources() {
  const { accentColor } = useTenantBranding();
  const { hasActiveService, loading: servicesLoading } = useTenantServices();
  const { loading: rbacLoading, isTenantAdmin, hasPermission } = useTenantRbac();
  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled =
    hasActiveService('vm-management') &&
    (isTenantAdmin || hasPermission('vms.read', 'vms.manage', 'vms.assign'));

  const load = useCallback(async () => {
    if (!enabled) {
      setVms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTenantVms();
      const recent = [...result.vms]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6);
      setVms(recent);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load resources.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (servicesLoading || rbacLoading) return;
    void load();
  }, [servicesLoading, rbacLoading, load]);

  if (servicesLoading || rbacLoading || !enabled) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Recent resources</h2>
          <p className="mt-0.5 text-xs text-gray-400">Latest activity across your enabled services</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={4} embedded />
      ) : error ? (
        <p className="px-6 py-10 text-center text-sm text-red-600">{error}</p>
      ) : vms.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Server className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No recent resources yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">Resource</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {vms.map((vm) => (
                <tr key={vm.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                  <td className="px-6 py-3">
                    <Link
                      href={`/console/dashboard/admin/vms/${vm.id}`}
                      className="font-medium text-gray-900 hover:underline"
                      style={{ color: undefined }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = accentColor;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '';
                      }}
                    >
                      {vm.name}
                    </Link>
                    <p className="font-mono text-xs text-gray-400">#{vm.vmid}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">VPS Hosting</td>
                  <td className="px-4 py-3">
                    <VMStatusBadge status={vm.status as VMStatus} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(vm.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
