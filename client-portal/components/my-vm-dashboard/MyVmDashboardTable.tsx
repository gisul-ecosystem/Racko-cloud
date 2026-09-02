'use client';

import { useState, Fragment } from 'react';
import type { MyVmDashboardRow, MyVmOriginServiceLabel } from '@/lib/myVmDashboardApi';
import type { ExternalVMProtocol } from '@/lib/externalVmApi';
import { externalVmProtocolBadgeClass } from '@/lib/externalVmApi';
import { formatAssignmentHolders } from '@/lib/externalVmAssignmentFormat';
import type { CatalogVmPowerAction, ICatalogVm } from '@/lib/vmCatalogApi';
import { CatalogVmDashboardDetails } from '@/components/my-vm-dashboard/CatalogVmDashboardDetails';
import { CatalogVmPowerControls } from '@/components/create-vm/CatalogVmPowerControls';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Monitor, ExternalLink } from 'lucide-react';

const SOURCE_BADGE_STYLES: Record<MyVmOriginServiceLabel, string> = {
  'VPS Hosting': 'border-red-200 bg-red-50 text-red-700',
  'VM Catalog': 'border-orange-200 bg-orange-50 text-orange-700',
  'Elastic Server Import': 'border-teal-200 bg-teal-50 text-teal-700',
  'External VM Import': 'border-slate-200 bg-slate-100 text-slate-700',
};

export function rowKey(row: MyVmDashboardRow): string {
  return `${row.resourceType}:${row._id}:${row.instanceId ?? ''}`;
}

export type CatalogPowerActionHandler = (
  id: string,
  action: CatalogVmPowerAction,
  instanceId?: string
) => Promise<{ action: CatalogVmPowerAction; panelUrl?: string; vm: ICatalogVm }>;

function ProtocolBadge({ protocol }: { protocol: ExternalVMProtocol | null }) {
  if (!protocol) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${externalVmProtocolBadgeClass(protocol)}`}
    >
      {protocol}
    </span>
  );
}

function SourceBadge({ label }: { label: MyVmOriginServiceLabel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${SOURCE_BADGE_STYLES[label]}`}
    >
      {label}
    </span>
  );
}

function ScheduleCell({ row }: { row: MyVmDashboardRow }) {
  if (!row.assignments.length) return <span className="text-gray-400">—</span>;
  const schedules = row.assignments
    .filter((a) => a.schedule)
    .map((a) => {
      const s = a.schedule!;
      const days = s.daysOfWeek.length ? `${s.daysOfWeek.length}d/wk` : 'Daily';
      return `${days} ${s.dailyStart}–${s.dailyEnd}`;
    });
  if (!schedules.length) return <span className="text-gray-400">No schedule</span>;
  return (
    <span className="text-sm text-gray-700">
      {schedules[0]}
      {schedules.length > 1 ? ` +${schedules.length - 1}` : ''}
    </span>
  );
}

function StatusBadge({ row }: { row: MyVmDashboardRow }) {
  const schedule = row.accessSchedule;
  if (schedule?.override) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Override active
      </span>
    );
  }

  const pendingStatuses = new Set([
    'creating',
    'pending_approval',
    'approved',
    'provisioning',
    'fulfilling',
    'ready_to_attach',
  ]);
  if (pendingStatuses.has(row.status)) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        {row.statusLabel}
      </span>
    );
  }

  if (row.status === 'stopped' || row.status === 'paused') {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
        {row.statusLabel}
      </span>
    );
  }

  if (row.status === 'failed' || row.status === 'error') {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
        {row.statusLabel}
      </span>
    );
  }

  const hasDateBound = schedule?.startDate || schedule?.endDate;
  if (hasDateBound || schedule?.weeklySchedule?.length) {
    return (
      <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        Scheduled
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
      {row.statusLabel}
    </span>
  );
}

function ActionButtons({
  row,
  isExpanded,
  onToggleDetails,
}: {
  row: MyVmDashboardRow;
  isExpanded: boolean;
  onToggleDetails: () => void;
}) {
  const isCatalog = row.resourceType === 'catalog_vm';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.canConsole && row.consolePath ? (
        <Link
          href={row.consolePath}
          className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a01717]"
        >
          <Monitor className="h-3.5 w-3.5" />
          Console
        </Link>
      ) : (
        <span
          className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-400"
          title="Console unavailable until the VM is ready"
        >
          Console
        </span>
      )}

      {isCatalog ? (
        <button
          type="button"
          onClick={onToggleDetails}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {isExpanded ? 'Hide' : 'Details'}
        </button>
      ) : row.managePath ? (
        <Link
          href={row.managePath}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Link>
      ) : null}
    </div>
  );
}

export function MyVmDashboardTable({
  rows,
  catalogPowerAction,
  onRefresh,
}: {
  rows: MyVmDashboardRow[];
  catalogPowerAction?: CatalogPowerActionHandler;
  onRefresh?: () => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">VM</th>
              <th className="px-4 py-3">Protocol</th>
              <th className="px-4 py-3">Assignee(s)</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const key = rowKey(row);
              const isExpanded = expandedKey === key;
              const isCatalog = row.resourceType === 'catalog_vm';
              const showAzurePowerInline =
                isCatalog &&
                row.status === 'active' &&
                row.powerControlMode === 'azure' &&
                Boolean(catalogPowerAction);

              return (
                <Fragment key={key}>
                  <tr className="transition hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.name}</p>
                      <p className="font-mono text-xs text-gray-500">{row.ipAddress || '—'}</p>
                      {row.username ? (
                        <p className="text-xs text-gray-400">
                          {row.protocol ? `${row.protocol.toUpperCase()} · ` : ''}
                          {row.username}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <ProtocolBadge protocol={row.protocol} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.assignments.length ? (
                        formatAssignmentHolders(row.assignments).labels.join(', ')
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ScheduleCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge label={row.originServiceLabel} />
                    </td>
                    <td className="px-4 py-3">
                      <ActionButtons
                        row={row}
                        isExpanded={isExpanded}
                        onToggleDetails={() =>
                          setExpandedKey((prev) => (prev === key ? null : key))
                        }
                      />
                    </td>
                  </tr>
                  {showAzurePowerInline && catalogPowerAction ? (
                    <tr className="border-b border-green-100 bg-green-50/40">
                      <td colSpan={7} className="px-4 py-4">
                        <CatalogVmPowerControls
                          vmId={row._id}
                          instanceId={row.instanceId}
                          powerControlMode="azure"
                          onPowerAction={catalogPowerAction}
                          onTerminated={onRefresh}
                        />
                      </td>
                    </tr>
                  ) : null}
                  {isCatalog && isExpanded && catalogPowerAction && !showAzurePowerInline ? (
                    <tr className="border-b border-green-100 bg-green-50/40">
                      <td colSpan={7} className="px-4 py-4">
                        <CatalogVmDashboardDetails
                          row={row}
                          onPowerAction={catalogPowerAction}
                          onRefresh={onRefresh}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
