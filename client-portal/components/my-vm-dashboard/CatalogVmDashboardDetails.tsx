'use client';

import { CatalogVmPowerControls } from '@/components/create-vm/CatalogVmPowerControls';
import type { MyVmDashboardRow } from '@/lib/myVmDashboardApi';
import type { CatalogVmPowerAction, ICatalogVm } from '@/lib/vmCatalogApi';

export function CatalogVmDashboardDetails({
  row,
  onPowerAction,
  onRefresh,
}: {
  row: MyVmDashboardRow;
  onPowerAction: (
    id: string,
    action: CatalogVmPowerAction,
    instanceId?: string
  ) => Promise<{ action: CatalogVmPowerAction; panelUrl?: string; vm: ICatalogVm }>;
  onRefresh?: () => void;
}) {
  const isActive = row.status === 'active';

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-800">
          Connection details
        </p>
        <div className="grid gap-3 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-xs text-gray-500">Hostname</span>
            <p className="font-mono text-xs">{row.hostname || '—'}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">IP address</span>
            <p className="font-mono text-xs">{row.ipAddress || '—'}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Username</span>
            <p className="font-mono text-xs">{row.username || '—'}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Password</span>
            <p className="font-mono text-xs">{row.password || '—'}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Protocol</span>
            <p className="font-mono text-xs uppercase">{row.protocol || '—'}</p>
          </div>
        </div>
      </div>

      {isActive ? (
        <div className="border-t border-green-100 pt-4">
          <CatalogVmPowerControls
            vmId={row._id}
            instanceId={row.instanceId}
            powerControlMode={row.powerControlMode ?? 'webyne'}
            onPowerAction={onPowerAction}
            onTerminated={onRefresh}
          />
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Power controls are available once the VM is active.
        </p>
      )}
    </div>
  );
}
