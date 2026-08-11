'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, RefreshCw, Server } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { VMStatusBadge } from '@/components/dashboard/VMStatusBadge';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantServices } from '@/context/TenantServicesContext';
import { ApiError } from '@/lib/apiClient';
import { hexToRgba, tenantAccentSurface } from '@/lib/tenantAccentStyles';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { fetchTenantExternalVMs } from '@/lib/tenantExternalVmApi';
import { openTenantUrlWithSession } from '@/lib/tenantPortalApiClient';
import { fetchTenantVms } from '@/lib/tenantVmApi';
import type { TenantVmSummary } from '@/types/tenantPortal';
import type { IExternalVM } from '@/lib/externalVmApi';
import type { VMStatus } from '@/lib/vmApi';

function ProtocolBadge({ protocol }: { protocol: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium uppercase text-gray-700">
      {protocol}
    </span>
  );
}

export function TenantUserResourcesTabs() {
  const { accentColor } = useTenantBranding();
  const { hasActiveService } = useTenantServices();
  const hasElastic = hasActiveService('elastic-servers');

  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [servers, setServers] = useState<IExternalVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalCount = vms.length + servers.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vmResult, serverResult] = await Promise.all([
        fetchTenantVms(),
        hasElastic ? fetchTenantExternalVMs() : Promise.resolve([]),
      ]);
      setVms(vmResult.vms);
      setServers(serverResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load resources.');
    } finally {
      setLoading(false);
    }
  }, [hasElastic]);

  useEffect(() => {
    void load();
  }, [load]);

  const accentLinkStyle = useMemo(() => ({ color: accentColor }), [accentColor]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">My VMs</h1>
          <p className="text-sm text-gray-500">
            Assigned virtual machines{hasElastic ? ' and imported servers' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-40"
          style={tenantAccentSurface(accentColor, 0.08)}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            style={{ color: accentColor }}
          />
          <span style={{ color: accentColor }}>Refresh</span>
        </button>
      </div>

      {error && !loading ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={4} cols={6} embedded />
          ) : totalCount === 0 ? (
            <div className="p-12 text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: hexToRgba(accentColor, 0.1) }}
              >
                <Server className="h-7 w-7" style={{ color: accentColor }} />
              </div>
              <p className="text-sm font-medium text-gray-700">No VMs assigned yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Your administrator will assign virtual machines to your account.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3">VM</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">IP</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm) => (
                    <tr key={`vm-${vm.id}`} className="border-b border-gray-50">
                      <td className="px-4 py-3 font-medium">{vm.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">VPS</td>
                      <td className="px-4 py-3">
                        <VMStatusBadge status={vm.status as VMStatus} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{vm.ipAddress ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/console/dashboard/admin/vms/${vm.id}`}
                          className="inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
                          style={accentLinkStyle}
                        >
                          View <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {servers.map((s) => {
                    const blocked = Boolean(s.myAccess && !s.myAccess.allowedNow);
                    return (
                    <tr key={`srv-${s._id}`} className="border-b border-gray-50">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">Imported Server</td>
                      <td className="px-4 py-3">
                        <ProtocolBadge protocol={s.protocol} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.ipAddress}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            if (blocked) return;
                            openTenantUrlWithSession(`${tenantConsole.elastic}/${s._id}/console`);
                          }}
                          className="inline-flex items-center gap-0.5 text-xs font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                          style={blocked ? undefined : accentLinkStyle}
                          title={
                            blocked
                              ? s.myAccess?.nextWindow
                                ? `Outside access window. Next: ${s.myAccess.nextWindow}`
                                : 'Outside your access window'
                              : 'Open console'
                          }
                        >
                          Console <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
