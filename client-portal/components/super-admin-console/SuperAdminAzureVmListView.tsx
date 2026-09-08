'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Cloud, Loader2, Plus, Search } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  attachManualAzureCatalogVm,
  fetchReadyManualAzureCatalogVms,
  fetchSuperAdminAzureCatalogVms,
  formatCatalogVmStatus,
  superAdminAzureCatalogVmPowerAction,
  type CatalogVmPowerAction,
  type ICatalogVm,
} from '@/lib/vmCatalogApi';
import { CatalogVmPowerControls } from '@/components/create-vm/CatalogVmPowerControls';
import {
  fetchSuperAdminExternalVmTargets,
  type SuperAdminTargetOption,
} from '@/lib/superAdminExternalVmApi';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ReadMoreText } from '@/components/ui/ReadMoreText';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

type OwnerMode = 'admin' | 'tenant';

interface PickerOption {
  id: string;
  label: string;
  searchText: string;
}

function toPickerOptions(rows: SuperAdminTargetOption[], mode: OwnerMode): PickerOption[] {
  return rows.map((row) => ({
    id: row.id,
    label: mode === 'tenant' ? row.label || row.name || row.id : row.email || row.label || row.id,
    searchText: [row.label, row.name, row.email, row.slug, row.id].filter(Boolean).join(' ').toLowerCase(),
  }));
}

function OwnerPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.searchText.includes(q)).slice(0, 50);
  }, [options, query]);

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          className={`${inputClass} pl-9`}
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <select className={`${inputClass} mt-2`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {filtered.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function vmDisplayName(vm: ICatalogVm): string {
  return vm.providerInstanceId || vm.hostname || vm.planName || vm._id;
}

function statusBadgeClass(status: ICatalogVm['status']): string {
  switch (status) {
    case 'active':
      return 'bg-green-50 text-green-800 border-green-100';
    case 'provisioning':
    case 'fulfilling':
      return 'bg-blue-50 text-blue-800 border-blue-100';
    case 'ready_to_attach':
      return 'bg-amber-50 text-amber-800 border-amber-100';
    case 'failed':
      return 'bg-red-50 text-red-800 border-red-100';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-100';
  }
}

export function SuperAdminAzureVmListView() {
  const { toasts, addToast, dismiss } = useToast();
  const [loading, setLoading] = useState(true);
  const [azureVms, setAzureVms] = useState<ICatalogVm[]>([]);
  const [targets, setTargets] = useState<{ admins: SuperAdminTargetOption[]; tenants: SuperAdminTargetOption[] }>({
    admins: [],
    tenants: [],
  });
  const [attachOwnerMode, setAttachOwnerMode] = useState<OwnerMode>('admin');
  const [attachOwnerId, setAttachOwnerId] = useState('');
  const [attachVmId, setAttachVmId] = useState<string | null>(null);

  const attachOwnerOptions = useMemo(
    () =>
      toPickerOptions(
        attachOwnerMode === 'admin' ? targets.admins : targets.tenants,
        attachOwnerMode
      ),
    [attachOwnerMode, targets.admins, targets.tenants]
  );

  const readyVms = useMemo(
    () => azureVms.filter((vm) => vm.status === 'ready_to_attach'),
    [azureVms]
  );

  const managedVms = useMemo(
    () => azureVms.filter((vm) => vm.status !== 'ready_to_attach'),
    [azureVms]
  );

  const refreshData = useCallback(async () => {
    const [targetRows, activeRows, readyRows] = await Promise.all([
      fetchSuperAdminExternalVmTargets(),
      fetchSuperAdminAzureCatalogVms(),
      fetchReadyManualAzureCatalogVms(),
    ]);
    setTargets(targetRows);

    const byId = new Map<string, ICatalogVm>();
    for (const vm of [...activeRows, ...readyRows]) {
      byId.set(vm._id, vm);
    }
    setAzureVms(
      [...byId.values()].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      )
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        await refreshData();
      } catch (err) {
        if (!cancelled) {
          addToast(
            'error',
            err instanceof ApiError ? err.message : 'Failed to load Azure VMs.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [addToast, refreshData]);

  useEffect(() => {
    const hasProvisioning = azureVms.some(
      (vm) => vm.status === 'provisioning' || vm.status === 'fulfilling'
    );
    if (!hasProvisioning) return;

    const timer = window.setInterval(() => {
      void refreshData().catch(() => undefined);
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [azureVms, refreshData]);

  async function handleAzurePowerAction(
    id: string,
    action: CatalogVmPowerAction,
    instanceId?: string
  ) {
    const result = await superAdminAzureCatalogVmPowerAction(id, action, instanceId);
    await refreshData();
    return { action: result.action, panelUrl: result.panelUrl };
  }

  async function handleAttach(vmId: string) {
    if (!attachOwnerId) {
      addToast('error', 'Select a customer to attach this VM to.');
      return;
    }
    setAttachVmId(vmId);
    try {
      await attachManualAzureCatalogVm(vmId, {
        ownerType: attachOwnerMode,
        ownerId: attachOwnerId,
      });
      addToast('success', 'Azure VM attached to customer.');
      await refreshData();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to attach Azure VM.');
    } finally {
      setAttachVmId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading Azure VMs…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[#B91C1C]">
            <Cloud className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wide">Super admin only</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Azure VMs</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            VMs created or registered from the Azure console. Manage power state or attach unassigned
            VMs to a customer.
          </p>
        </div>
        <Link
          href="/super-admin-console/create-vm/azure"
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B]"
        >
          <Plus className="h-4 w-4" />
          Create / attach VM
        </Link>
      </div>

      {readyVms.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Ready to attach</h2>
          <p className="mt-1 text-sm text-gray-600">
            Assign these VMs to a platform admin or tenant.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Attach to</label>
              <select
                className={inputClass}
                value={attachOwnerMode}
                onChange={(e) => {
                  setAttachOwnerMode(e.target.value as OwnerMode);
                  setAttachOwnerId('');
                }}
              >
                <option value="admin">Platform admin</option>
                <option value="tenant">Tenant</option>
              </select>
            </div>
            <OwnerPicker
              label={attachOwnerMode === 'admin' ? 'Platform admin' : 'Tenant'}
              options={attachOwnerOptions}
              value={attachOwnerId}
              onChange={setAttachOwnerId}
            />
          </div>
        </section>
      ) : null}

      {azureVms.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Cloud className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-900">No Azure VMs yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Create a new VM or register an existing one from Azure.
          </p>
          <Link
            href="/super-admin-console/create-vm/azure"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#B91C1C] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Go to Create / Attach
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">VM</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Resource group</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Region</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">IP</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Plan</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {azureVms.map((vm) => (
                  <tr key={vm._id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{vmDisplayName(vm)}</p>
                      {vm.hostname && vm.hostname !== vm.providerInstanceId ? (
                        <p className="mt-0.5 text-xs text-gray-500">{vm.hostname}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(vm.status)}`}
                      >
                        {formatCatalogVmStatus(vm.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{vm.azureResourceGroup || '—'}</td>
                    <td className="px-4 py-4 text-gray-600">{vm.region || '—'}</td>
                    <td className="px-4 py-4 font-mono text-xs text-gray-600">{vm.ipAddress || '—'}</td>
                    <td className="px-4 py-4 text-gray-600">{vm.planName || '—'}</td>
                    <td className="px-4 py-4 text-right">
                      {vm.status === 'ready_to_attach' ? (
                        <button
                          type="button"
                          disabled={attachVmId === vm._id}
                          onClick={() => void handleAttach(vm._id)}
                          className="rounded-lg border border-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#B91C1C]/5 disabled:opacity-60"
                        >
                          {attachVmId === vm._id ? 'Attaching…' : 'Attach'}
                        </button>
                      ) : vm.status === 'active' ? (
                        <div className="inline-block text-left">
                          <CatalogVmPowerControls
                            vmId={vm._id}
                            powerControlMode="azure"
                            onPowerAction={handleAzurePowerAction}
                            onTerminated={() => void refreshData()}
                          />
                        </div>
                      ) : vm.status === 'failed' ? (
                        <ReadMoreText
                          text={vm.fulfillError || 'Provisioning failed'}
                          previewLength={100}
                        />
                      ) : (
                        <span className="text-xs text-gray-500">
                          {vm.status === 'provisioning' || vm.status === 'fulfilling'
                            ? 'Provisioning…'
                            : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
            {managedVms.length} active or provisioning · {readyVms.length} ready to attach
          </p>
        </div>
      )}
    </div>
  );
}
