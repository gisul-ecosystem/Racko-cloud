'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import { tenantAccentButton, hexToRgba } from '@/lib/tenantAccentStyles';
import { tenantVps } from '@/lib/tenantAdminRoutes';
import {
  formatBillingPeriod,
  formatPlanPeriodEnd,
  getPlanDisplayStatus,
  planExpiryLabel,
} from '@/lib/tenantPlanUtils';
import {
  fetchTenantVm,
  fetchTenantVmStatus,
  openTenantVmConsole,
  restartTenantVm,
  startTenantVm,
  stopTenantVm,
} from '@/lib/tenantVmApi';
import type { TenantVmDetails, TenantVmLiveStatus, TenantVmSummary } from '@/types/tenantPortal';
import type { VMStatus } from '@/lib/vmApi';

const VM_LIST_PATH = tenantVps.vms;
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
    const session = await openTenantVmConsole(vmId, protocol, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
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
            <Link href={`/console/dashboard/plans/${vm.id}`} className="font-medium underline">
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
                  href={`/console/dashboard/plans/${vm.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  style={{ color: accentColor }}
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
                    <Link
                      href="/console/dashboard/admin/users"
                      className="font-medium hover:underline"
                      style={{ color: accentColor }}
                    >
                      delete the user
                    </Link>{' '}
                    on the Users page — this frees the VM.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">No user assigned to this VM.</p>
                  <Link
                    href="/console/dashboard/admin/assign-vms"
                    className="inline-flex text-sm font-medium hover:underline"
                    style={{ color: accentColor }}
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
