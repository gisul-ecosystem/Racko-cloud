'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useVmCatalogVms } from '../../../../hooks/useVmCatalogVms';
import { useVmCatalogPortal } from '../../../../context/VmCatalogPortalContext';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import {
  catalogVmStatusNote,
  catalogVmStatusTone,
  formatCatalogVmStatus,
  type ICatalogVm,
  type VmCatalogCategory,
} from '../../../../lib/vmCatalogApi';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Monitor,
  Plus,
  Server,
  Trash2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CatalogVmPowerControls } from '../../../../components/create-vm/CatalogVmPowerControls';
import {
  CatalogVmTermModal,
  type CatalogVmTermMode,
} from '../../../../components/create-vm/CatalogVmTermModal';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatInr(amount: number | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₹ ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Whole days from today until `iso`, in UTC so a date never lands off by one. */
function daysUntil(iso: string): number | null {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((endDay - today) / 86_400_000);
}

const URGENT_TAG = 'bg-rose-50 text-rose-700 ring-rose-200';
const SOON_TAG = 'bg-amber-50 text-amber-700 ring-amber-200';

/** Days out at which the term starts showing a countdown tag. */
const EXPIRING_SOON_DAYS = 7;

/**
 * Hourly plans bill continuously until the VM is terminated, so they have no
 * term that can lapse and never carry an end date.
 */
function hasFixedTerm(billing: string): boolean {
  const b = billing.toLowerCase();
  return !b.includes('hour') && !b.includes('day');
}

/** Provider term end date, with a countdown tag once it is close. */
function TermEnd({ iso, billing }: { iso: string | undefined; billing: string }) {
  if (!iso) {
    return (
      <span className="text-xs text-gray-400">
        {hasFixedTerm(billing) ? '—' : 'no fixed end'}
      </span>
    );
  }

  const days = daysUntil(iso);
  let tag: { text: string; tone: string } | null = null;
  if (days !== null) {
    if (days < 0) tag = { text: 'expired', tone: URGENT_TAG };
    else if (days === 0) tag = { text: 'ends today', tone: URGENT_TAG };
    else if (days === 1) tag = { text: 'ends tomorrow', tone: SOON_TAG };
    else if (days <= EXPIRING_SOON_DAYS)
      tag = { text: `ends in ${days} days`, tone: SOON_TAG };
  }

  return (
    <div>
      <p className="text-xs text-gray-700">{iso.slice(0, 10)}</p>
      {tag && (
        <span
          className={`mt-1 inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tag.tone}`}
        >
          {tag.text}
        </span>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: VmCatalogCategory }) {
  const styles: Record<string, string> = {
    ubuntu: 'bg-orange-50 text-orange-700 border-orange-200',
    rocky: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    debian: 'bg-pink-50 text-pink-700 border-pink-200',
    linux: 'bg-green-50 text-green-700 border-green-200',
    windows: 'bg-blue-50 text-blue-700 border-blue-200',
    gpu: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[category] || styles.linux}`}
    >
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: ICatalogVm['status'] }) {
  const tone = catalogVmStatusTone(status);
  const note = catalogVmStatusNote(status);
  const styles = {
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[tone];

  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
      >
        {formatCatalogVmStatus(status)}
      </span>
      {note ? <p className="text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

function ConnectionDetails({ vm }: { vm: ICatalogVm }) {
  return (
    <div className="grid gap-3 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <span className="text-xs text-gray-500">Hostname</span>
        <p className="font-mono text-xs">{vm.hostname || '—'}</p>
      </div>
      <div>
        <span className="text-xs text-gray-500">IP address</span>
        <p className="font-mono text-xs">{vm.ipAddress || '—'}</p>
      </div>
      <div>
        <span className="text-xs text-gray-500">Username</span>
        <p className="font-mono text-xs">{vm.username || '—'}</p>
      </div>
      <div>
        <span className="text-xs text-gray-500">Password</span>
        <p className="font-mono text-xs">{vm.password || '—'}</p>
      </div>
      <div>
        <span className="text-xs text-gray-500">Protocol</span>
        <p className="font-mono text-xs uppercase">{vm.protocol || '—'}</p>
      </div>
    </div>
  );
}

export default function MyVmsPage() {
  const { routes, api } = useVmCatalogPortal();
  const { vms, loading, error, refetch } = useVmCatalogVms();
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [term, setTerm] = useState<{ vm: ICatalogVm; mode: CatalogVmTermMode } | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterProjectId = searchParams?.get('projectId')?.trim() || null;

  const visibleVms = useMemo(() => {
    if (!filterProjectId) return vms;
    return vms.filter((vm) => vm.projectId === filterProjectId);
  }, [vms, filterProjectId]);

  // Only the super-admin portal wires these up, so the org and tenant portals
  // render this same page without term controls.
  const canManageTerm = Boolean(api.extendExpiry && api.deleteVm);

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My VM</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            VMs and purchase requests for your account
          </p>
          {filterProjectId ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                Filtered by project
              </span>
              <Link
                href={routes.myVms}
                className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
              >
                Clear filter
              </Link>
            </div>
          ) : null}
        </div>
        <Link
          href={routes.create}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
        >
          <Plus className="h-4 w-4" />
          Create VM
        </Link>
      </div>

      {notice ? (
        <div
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
          role="status"
        >
          <p className="text-sm text-green-800">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold text-green-700 hover:text-green-900"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={6} cols={9} embedded />
          ) : visibleVms.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <Server className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">
                {filterProjectId ? 'No VMs for this project' : 'No VMs yet'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {filterProjectId
                  ? 'Create a VM from this project’s Use service flow to see it here.'
                  : 'When you submit a catalog request, it will show up here.'}
              </p>
              <Link
                href={
                  filterProjectId
                    ? `${routes.create}?projectId=${encodeURIComponent(filterProjectId)}`
                    : routes.create
                }
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#B91C1C] hover:text-[#a01717]"
              >
                <Plus className="h-4 w-4" />
                Create your first VM
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Plan
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Project
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Template
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Term ends
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Requested
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleVms.map((vm, index) => {
                    const isActive = vm.status === 'active';
                    const instanceKey = vm.instanceId
                      ? `${vm._id}:${vm.instanceId}`
                      : `${vm._id}:${index}`;
                    const isExpanded = expandedRowKey === instanceKey;
                    const consoleHref = vm.instanceId
                      ? `${routes.console(vm._id)}?instanceId=${encodeURIComponent(vm.instanceId)}`
                      : routes.console(vm._id);
                    return (
                      <FragmentRow
                        key={instanceKey}
                        vm={vm}
                        index={index}
                        isActive={isActive}
                        isExpanded={isExpanded}
                        onToggle={() =>
                          setExpandedRowKey((prev) =>
                            prev === instanceKey ? null : instanceKey
                          )
                        }
                        onOpenConsole={() => router.push(consoleHref)}
                        onPowerAction={api.powerAction}
                        onRefresh={refetch}
                        canManageTerm={canManageTerm}
                        onExtend={() => setTerm({ vm, mode: 'extend' })}
                        onDelete={() => setTerm({ vm, mode: 'delete' })}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {term && api.extendExpiry && api.deleteVm ? (
        <CatalogVmTermModal
          vm={term.vm}
          mode={term.mode}
          onClose={() => setTerm(null)}
          onExtend={api.extendExpiry}
          onDelete={api.deleteVm}
          onDone={(message) => {
            setNotice(message);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function FragmentRow({
  vm,
  index,
  isActive,
  isExpanded,
  onToggle,
  onOpenConsole,
  onPowerAction,
  onRefresh,
  canManageTerm,
  onExtend,
  onDelete,
}: {
  vm: ICatalogVm;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenConsole: () => void;
  onPowerAction: (
    id: string,
    action: import('../../../../lib/vmCatalogApi').CatalogVmPowerAction,
    instanceId?: string
  ) => Promise<{
    action: import('../../../../lib/vmCatalogApi').CatalogVmPowerAction;
    panelUrl?: string;
    vm: ICatalogVm;
  }>;
  onRefresh: () => void;
  canManageTerm: boolean;
  onExtend: () => void;
  onDelete: () => void;
}) {
  const showAzurePowerInline =
    isActive && vm.powerControlMode === 'azure';

  return (
    <>
      <tr
        className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
          index % 2 !== 0 ? 'bg-gray-50/40' : ''
        }`}
      >
        <td className="px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
              <Server className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium text-gray-900">{vm.planName}</p>
              <p className="text-xs text-gray-500">
                {vm.billing}
                {vm.instanceTotal && vm.instanceTotal > 1
                  ? ` · VM ${vm.instanceIndex || 1} of ${vm.instanceTotal}`
                  : vm.quantity > 1
                    ? ` · ×${vm.quantity}`
                    : ''}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5">
          {vm.projectId && vm.projectName ? (
            <span
              className="inline-flex max-w-[12rem] truncate rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100"
              title={
                vm.clientName
                  ? `${vm.projectName} · ${vm.clientName}`
                  : vm.projectName
              }
            >
              {vm.projectName}
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              Unassigned
            </span>
          )}
        </td>
        <td className="px-4 py-3.5">
          <CategoryBadge category={vm.category} />
        </td>
        <td className="px-4 py-3.5 text-gray-600">{vm.template.label}</td>
        <td className="px-4 py-3.5">
          <StatusBadge status={vm.status} />
          {isActive && (vm.ipAddress || vm.hostname) ? (
            <p className="mt-1 font-mono text-xs text-gray-500">
              {vm.hostname ? `${vm.hostname} · ` : ''}
              {vm.ipAddress || ''}
            </p>
          ) : null}
        </td>
        <td className="px-4 py-3.5 font-mono text-xs text-gray-600">
          {formatInr(vm.pricingSnapshot.total)}
        </td>
        <td className="px-4 py-3.5">
          <TermEnd iso={vm.expiresAt} billing={vm.billing} />
        </td>
        <td className="px-4 py-3.5 text-gray-500">{formatDateTime(vm.createdAt)}</td>
        <td className="px-4 py-3.5 text-right">
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            {isActive ? (
              <>
                <button
                  type="button"
                  onClick={onOpenConsole}
                  className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a01717]"
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Console
                </button>
                <button
                  type="button"
                  onClick={onToggle}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {isExpanded ? 'Hide' : 'Details'}
                </button>
              </>
            ) : null}
            {canManageTerm ? (
              <>
                <button
                  type="button"
                  onClick={onExtend}
                  title="Record a new provider end date after renewing"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Extend
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  title="Remove this VM from Racko"
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            ) : null}
            {!isActive && !canManageTerm ? (
              <span className="text-xs text-gray-400">—</span>
            ) : null}
          </div>
        </td>
      </tr>
      {isActive && showAzurePowerInline ? (
        <tr className="border-b border-green-100 bg-green-50/40">
          <td colSpan={9} className="px-6 py-4">
            <CatalogVmPowerControls
              vmId={vm.parentRequestId ?? vm._id}
              instanceId={vm.instanceId}
              powerControlMode="azure"
              onPowerAction={onPowerAction}
              onTerminated={onRefresh}
            />
          </td>
        </tr>
      ) : null}
      {isActive && isExpanded && !showAzurePowerInline ? (
        <tr className="border-b border-green-100 bg-green-50/40">
          <td colSpan={9} className="px-6 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-800">
              Connection details
            </p>
            <ConnectionDetails vm={vm} />
            <div className="mt-4 border-t border-green-100 pt-4">
              <CatalogVmPowerControls
                vmId={vm.parentRequestId ?? vm._id}
                instanceId={vm.instanceId}
                powerControlMode={vm.powerControlMode ?? 'webyne'}
                onPowerAction={onPowerAction}
                onTerminated={onRefresh}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
