'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ChevronLeft,
  Cpu,
  ExternalLink,
  HardDrive,
  Loader2,
  MemoryStick,
  Monitor,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Users,
} from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { VMStatusBadge, UsageBar } from '@/components/dashboard/VMStatusBadge';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import {
  formatBillingPeriod,
  formatPlanPeriodEnd,
  getPlanDisplayStatus,
  planExpiryLabel,
} from '@/lib/tenantPlanUtils';
import {
  fetchTenantVm,
  fetchTenantVmStatus,
  fetchTenantVms,
  fetchTenantVmsForUser,
  openTenantVmConsole,
  restartTenantVm,
  startTenantVm,
  stopTenantVm,
} from '@/lib/tenantVmApi';
import type { TenantVmDetails, TenantVmLiveStatus, TenantVmSummary } from '@/types/tenantPortal';
import type { VMStatus } from '@/lib/vmApi';

const VM_LIST_PATH = '/tenant/dashboard/vms';
type PowerAction = 'start' | 'stop' | 'restart';

function isPlanExpired(vm: Pick<TenantVmSummary, 'planStatus' | 'planPeriodEnd'>): boolean {
  if (!vm.planStatus || !vm.planPeriodEnd) return false;
  return (
    getPlanDisplayStatus({
      planStatus: vm.planStatus,
      planPeriodEnd: vm.planPeriodEnd,
    }) === 'expired'
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function openPopupShell(): Window | null {
  try {
    return window.open('', '_blank', 'noopener,noreferrer');
  } catch {
    return null;
  }
}

async function launchConsole(vmId: string, protocol?: 'rdp' | 'ssh' | 'vnc'): Promise<void> {
  const popup = openPopupShell();
  try {
    const session = await openTenantVmConsole(vmId, protocol);
    if (popup) {
      popup.location.href = session.clientUrl;
    } else {
      window.open(session.clientUrl, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    if (popup) popup.close();
    throw error;
  }
}

function PageNotice({
  children,
  tone = 'amber',
}: {
  children: React.ReactNode;
  tone?: 'amber' | 'blue';
}) {
  const styles =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

function PlanStatusCell({ vm }: { vm: TenantVmSummary }) {
  if (!vm.planStatus || !vm.planPeriodEnd) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const display = getPlanDisplayStatus({
    planStatus: vm.planStatus,
    planPeriodEnd: vm.planPeriodEnd,
  });

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          display === 'expired'
            ? 'bg-red-50 text-red-700'
            : display === 'expiring_soon'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-green-50 text-green-700'
        }`}
      >
        {display === 'expiring_soon' ? 'Expiring soon' : display === 'expired' ? 'Expired' : 'Active'}
      </span>
      <p className="text-xs text-gray-500">
        {planExpiryLabel({ planStatus: vm.planStatus, planPeriodEnd: vm.planPeriodEnd })}
      </p>
    </div>
  );
}

export function TenantVmListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantUser } = useTenantAuth();
  const { toasts, addToast, dismiss } = useToast();

  const isAdmin = tenantUser?.role === 'tenant_admin';

  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const status = searchParams.get('status') ?? '';
  const node = searchParams.get('node') ?? '';
  const userId = searchParams.get('userId') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result =
        isAdmin && userId
          ? await fetchTenantVmsForUser(userId)
          : await fetchTenantVms({
              status: status || undefined,
              node: node || undefined,
            });
      const filtered =
        isAdmin && userId
          ? result.vms.filter(
              (vm) => (!status || vm.status === status) && (!node || vm.node === node)
            )
          : result.vms;
      setVms(filtered);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, node, status, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nodes = useMemo(() => Array.from(new Set(vms.map((vm) => vm.node))).sort(), [vms]);

  const setQueryParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${VM_LIST_PATH}?${next.toString()}`);
  };

  const performPowerAction = async (vm: TenantVmSummary, action: PowerAction) => {
    setActionId(`${action}:${vm.id}`);
    try {
      if (action === 'start') await startTenantVm(vm.id);
      else if (action === 'stop') await stopTenantVm(vm.id);
      else await restartTenantVm(vm.id);
      addToast('success', `${vm.name}: ${action} requested.`);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${action} VM.`);
    } finally {
      setActionId(null);
    }
  };

  const handleConsole = async (vm: TenantVmSummary) => {
    setActionId(`console:${vm.id}`);
    try {
      await launchConsole(vm.id, vm.consoleProtocol);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to open console.');
    } finally {
      setActionId(null);
    }
  };

  const title = isAdmin && userId ? 'Assigned VMs' : isAdmin ? 'Tenant VMs' : 'My VMs';

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? 'View and operate provisioned tenant virtual machines.'
              : 'Access and operate your assigned virtual machines.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link
              href="/tenant/dashboard/vms/onboard"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Onboard VMs
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {isAdmin && userId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>Showing VMs assigned to a selected tenant user.</span>
          <Link href={VM_LIST_PATH} className="font-medium underline">
            View all tenant VMs
          </Link>
        </div>
      ) : null}

      {error && !loading ? (
        <ErrorState title="VMs unavailable" message={error} onRetry={() => void load()} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-6 py-4">
            <select
              value={status}
              onChange={(event) => setQueryParam('status', event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="paused">Paused</option>
              <option value="suspended">Suspended</option>
              <option value="error">Error</option>
            </select>
            <select
              value={node}
              onChange={(event) => setQueryParam('node', event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All nodes</option>
              {nodes.map((nodeName) => (
                <option key={nodeName} value={nodeName}>
                  {nodeName}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={8} embedded />
          ) : vms.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <Server className="h-7 w-7 text-[#B91C1C]" />
              </div>
              <p className="font-medium text-gray-700">No VMs yet.</p>
              <p className="mt-1 text-sm text-gray-500">
                {isAdmin
                  ? 'Place an order or onboard users onto provisioned VMs.'
                  : 'Your tenant admin will assign virtual machines to your account.'}
              </p>
              {isAdmin ? (
                <div className="mt-4 flex justify-center gap-4 text-sm">
                  <Link href="/tenant/dashboard/orders" className="font-medium text-[#B91C1C] hover:underline">
                    Go to orders
                  </Link>
                  <Link
                    href="/tenant/dashboard/vms/onboard"
                    className="font-medium text-[#B91C1C] hover:underline"
                  >
                    Onboard VMs
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">VM</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Node / IP</th>
                    <th className="px-4 py-3">Specs</th>
                    <th className="px-4 py-3">Plan</th>
                    {isAdmin ? <th className="px-4 py-3">Assigned</th> : null}
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vms.map((vm) => {
                    const expired = isPlanExpired(vm);
                    const isRunning = vm.status === 'running';
                    const isStopped = vm.status === 'stopped';
                    const detailHref = `${VM_LIST_PATH}/${vm.id}`;

                    return (
                      <tr key={vm.id} className="border-b border-gray-50 align-top">
                        <td className="px-4 py-3">
                          <Link href={detailHref} className="block">
                            <p className="font-medium text-gray-900 hover:text-[#B91C1C]">{vm.name}</p>
                            <p className="mt-1 text-xs text-gray-500">#{vm.vmid}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <VMStatusBadge status={vm.status as VMStatus} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <p>{vm.node}</p>
                          <p className="mt-1 font-mono text-gray-500">{vm.ipAddress ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {vm.allocatedCpu} vCPU
                          <br />
                          {vm.allocatedMemoryGb} GB RAM
                          <br />
                          {vm.allocatedDiskGb} GB disk
                        </td>
                        <td className="px-4 py-3">
                          <PlanStatusCell vm={vm} />
                        </td>
                        {isAdmin ? (
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {vm.assignment ? (
                              <div>
                                <p className="font-medium text-gray-900">{vm.assignment.email}</p>
                                {!vm.assignment.isActive ? (
                                  <p className="mt-1 text-red-600">Inactive user</p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-gray-400">Unassigned</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={detailHref}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              disabled={expired || !isStopped || actionId === `start:${vm.id}`}
                              onClick={() => void performPowerAction(vm, 'start')}
                              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs text-green-700 disabled:opacity-40"
                            >
                              {actionId === `start:${vm.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Start'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={expired || !isRunning || actionId === `stop:${vm.id}`}
                              onClick={() => void performPowerAction(vm, 'stop')}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-40"
                            >
                              {actionId === `stop:${vm.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Stop'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={expired || !isRunning || actionId === `restart:${vm.id}`}
                              onClick={() => void performPowerAction(vm, 'restart')}
                              className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-40"
                            >
                              {actionId === `restart:${vm.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Restart'
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={
                                expired ||
                                !isRunning ||
                                !vm.consoleReady ||
                                actionId === `console:${vm.id}`
                              }
                              onClick={() => void handleConsole(vm)}
                              className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs text-blue-700 disabled:opacity-40"
                            >
                              {actionId === `console:${vm.id}` ? 'Opening…' : 'Console'}
                            </button>
                          </div>
                          {expired ? (
                            <p className="mt-2 text-xs text-red-600">
                              Plan expired.{' '}
                              {isAdmin ? (
                                <Link href={`/tenant/dashboard/plans/${vm.id}`} className="underline">
                                  Renew in VM Plans
                                </Link>
                              ) : (
                                'Contact your tenant admin to renew this VM plan.'
                              )}
                            </p>
                          ) : null}
                          {!expired && isRunning && !vm.consoleReady ? (
                            <p className="mt-2 text-xs text-amber-600">Console preparing…</p>
                          ) : null}
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

export function TenantVmDetailView() {
  const params = useParams<{ vmId: string }>();
  const vmId = params.vmId;
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const isAdmin = tenantUser?.role === 'tenant_admin';

  const [details, setDetails] = useState<TenantVmDetails | null>(null);
  const [liveStatus, setLiveStatus] = useState<TenantVmLiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<PowerAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [consoleLoading, setConsoleLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTenantVm(vmId);
      setDetails(data);
      setLiveStatus(data.liveStatus ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VM.');
    } finally {
      setLoading(false);
    }
  }, [vmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshLive = useCallback(async () => {
    try {
      const status = await fetchTenantVmStatus(vmId);
      setLiveStatus(status);
    } catch {
      // best effort
    }
  }, [vmId]);

  useEffect(() => {
    if (!details || details.vm.status !== 'running' || details.vm.consoleReady) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [details, load]);

  if (loading && !details) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="space-y-4">
        <Link
          href={VM_LIST_PATH}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <ErrorState title="VM unavailable" message={error ?? 'VM not found.'} onRetry={() => void load()} />
      </div>
    );
  }

  const vm = details.vm;
  const expired = isPlanExpired(vm);
  const isRunning = vm.status === 'running';
  const isStopped = vm.status === 'stopped';
  const canConsole = isRunning && vm.consoleReady && !expired;

  const confirmDescription =
    action === 'start'
      ? `Start ${vm.name}?`
      : action === 'stop'
        ? `Gracefully stop ${vm.name}?`
        : `Restart ${vm.name}?`;

  const doAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      if (action === 'start') await startTenantVm(vm.id);
      if (action === 'stop') await stopTenantVm(vm.id);
      if (action === 'restart') await restartTenantVm(vm.id);
      addToast('success', `${vm.name}: ${action} requested.`);
      setAction(null);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${action} VM.`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {action ? (
        <ConfirmModal
          open
          title={`${action[0]?.toUpperCase()}${action.slice(1)} VM`}
          description={confirmDescription}
          confirmLabel={action[0]?.toUpperCase() + action.slice(1)}
          confirmVariant="warning"
          loading={actionLoading}
          onConfirm={() => void doAction()}
          onCancel={() => setAction(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={VM_LIST_PATH}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to VMs
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{vm.name}</h1>
            <VMStatusBadge status={vm.status as VMStatus} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            #{vm.vmid} · {vm.node}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshLive()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            disabled={expired || !isStopped}
            onClick={() => setAction('start')}
            className="inline-flex items-center gap-2 rounded-lg border border-green-200 px-3 py-2 text-sm text-green-700 disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Start
          </button>
          <button
            type="button"
            disabled={expired || !isRunning}
            onClick={() => setAction('stop')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
          <button
            type="button"
            disabled={expired || !isRunning}
            onClick={() => setAction('restart')}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-700 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Restart
          </button>
          <button
            type="button"
            disabled={!canConsole || consoleLoading}
            onClick={async () => {
              setConsoleLoading(true);
              try {
                await launchConsole(vm.id, vm.consoleProtocol);
              } catch (err) {
                addToast('error', err instanceof ApiError ? err.message : 'Failed to open console.');
              } finally {
                setConsoleLoading(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={tenantAccentButton(accentColor)}
          >
            {consoleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
            Console
          </button>
        </div>
      </div>

      {expired ? (
        <PageNotice>
          Plan expired.{' '}
          {isAdmin ? (
            <Link href={`/tenant/dashboard/plans/${vm.id}`} className="font-medium underline">
              Renew this VM in VM Plans
            </Link>
          ) : (
            'Contact your tenant admin to renew this VM plan.'
          )}
        </PageNotice>
      ) : null}

      {!expired && isRunning && !vm.consoleReady ? (
        <PageNotice tone="blue">Console preparing… wait a moment and refresh if needed.</PageNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Activity className="h-4 w-4 text-gray-400" />
              {liveStatus ? 'Live status' : 'Resources'}
            </h2>
            {!liveStatus ? (
              <span className="text-xs text-gray-400">Start the VM to see live metrics</span>
            ) : null}
          </div>

          {liveStatus ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Cpu className="h-3.5 w-3.5" /> CPU
                  </span>
                  <span className="text-xs text-gray-600">{liveStatus.cpu.allocated} vCPU allocated</span>
                </div>
                <UsageBar pct={liveStatus.cpu.usagePercent} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MemoryStick className="h-3.5 w-3.5" /> Memory
                  </span>
                  <span className="text-xs text-gray-600">
                    {liveStatus.memory.usedGb.toFixed(2)} / {liveStatus.memory.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <UsageBar pct={liveStatus.memory.usagePercent} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <HardDrive className="h-3.5 w-3.5" /> Disk
                  </span>
                  <span className="text-xs text-gray-600">
                    {liveStatus.disk.usedGb.toFixed(2)} / {liveStatus.disk.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <UsageBar
                  pct={
                    liveStatus.disk.allocatedGb > 0
                      ? (liveStatus.disk.usedGb / liveStatus.disk.allocatedGb) * 100
                      : 0
                  }
                />
              </div>
              <div className="grid gap-3 border-t border-gray-50 pt-2 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Network className="h-3.5 w-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">IP address</p>
                    <p className="text-xs font-mono text-gray-700">{liveStatus.ipAddress ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Uptime</p>
                    <p className="text-xs text-gray-700">{liveStatus.uptime.formatted}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'vCPU', value: `${vm.allocatedCpu} cores` },
                { label: 'Memory', value: `${vm.allocatedMemoryGb} GB` },
                { label: 'Disk', value: `${vm.allocatedDiskGb} GB` },
                { label: 'IP address', value: vm.ipAddress ?? '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-gray-800">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Server className="h-4 w-4 text-gray-400" />
              Summary
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Node</span>
                <span className="text-xs text-gray-700">{vm.node}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Plan</span>
                <span className="text-xs text-gray-700">
                  {vm.planStatus ? formatBillingPeriod(vm.billingPeriod ?? 'monthly') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Period end</span>
                <span className="text-xs text-gray-700">
                  {vm.planPeriodEnd ? formatPlanPeriodEnd(vm.planPeriodEnd) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Console</span>
                <span className="text-xs text-gray-700">{vm.consoleProtocol.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Updated</span>
                <span className="text-xs text-gray-700">{formatDateTime(vm.updatedAt)}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              {isAdmin ? (
                <Link
                  href={`/tenant/dashboard/plans/${vm.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#B91C1C] hover:underline"
                >
                  Open VM plan
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <p className="text-xs text-gray-500">
                  Contact your tenant admin for renewals and billing changes.
                </p>
              )}
            </div>
          </div>

          {isAdmin ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Users className="h-4 w-4 text-gray-400" />
                Assignment
              </h2>
              {vm.assignment ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">{vm.assignment.email}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {vm.assignment.isActive ? 'Active tenant user' : 'Inactive tenant user'}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    To remove access,{' '}
                    <Link href="/tenant/dashboard/users" className="font-medium text-[#B91C1C] hover:underline">
                      delete the user
                    </Link>{' '}
                    on the Users page — this frees the VM.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">No user assigned to this VM.</p>
                  <Link
                    href="/tenant/dashboard/vms/onboard"
                    className="inline-flex text-sm font-medium text-[#B91C1C] hover:underline"
                  >
                    Onboard a user onto this VM
                  </Link>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
