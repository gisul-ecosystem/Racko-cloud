'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../../context/AuthContext';
import {
  fetchVMDetails, fetchVMStatus, fetchVMEvents, startVM, stopVM,
  forceStopVM, restartVM, resetVM, deleteVM,
  enableVirtualization, disableVirtualization,
  type VMDetails, type VMLiveStatus, type VMEvent, type HyperVStatus, type SoftwareInstallEntry,
} from '../../../../../lib/vmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { VMStatusBadge, CloneTypeBadge, UsageBar } from '../../../../../components/dashboard/VMStatusBadge';
import { HyperVStatusBadge } from '../../../../../components/dashboard/HyperVStatusBadge';
import { ConfirmModal } from '../../../../../components/ui/ConfirmModal';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import {
  ChevronLeft, Play, Square, Zap, RotateCcw,
  RefreshCw, Trash2, Cpu, MemoryStick, HardDrive,
  Network, Clock, Server, Activity, Monitor,
} from 'lucide-react';

/**
 * Best-effort protocol pick for the browser console.
 * IVM has no os field yet — we sniff name + templateName.
 * Defaults to 'rdp' when nothing matches, matching the backend default.
 */
function pickConsoleProtocol(name?: string, templateName?: string): 'rdp' | 'ssh' {
  const haystack = `${name ?? ''} ${templateName ?? ''}`.toLowerCase();
  if (/\b(win|windows|w10|w11|server)\b/.test(haystack)) return 'rdp';
  if (/\b(ubuntu|debian|centos|rhel|fedora|alma|rocky|linux|alpine)\b/.test(haystack)) return 'ssh';
  return 'rdp';
}

type PowerOp = 'start' | 'stop' | 'force-stop' | 'restart' | 'reset' | 'delete';

// ─── Events section — connects fetchVMEvents (GET /api/v1/vms/:vmId/events) ──

function VMEventsSection({ vmId, initialEvents }: { vmId: string; initialEvents: VMEvent[] }) {
  const [events, setEvents] = useState<VMEvent[]>(initialEvents);
  const [expanded, setExpanded] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  async function loadAllEvents() {
    setLoadingAll(true);
    setEventsError(null);
    try {
      const all = await fetchVMEvents(vmId);
      setEvents(all);
      setAllLoaded(true);
      setExpanded(true);
    } catch (err) {
      setEventsError(err instanceof ApiError ? err.message : 'Failed to load events.');
    } finally {
      setLoadingAll(false);
    }
  }

  const displayed = expanded ? events : events.slice(0, 10);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Events {allLoaded && <span className="text-gray-400 font-normal">({events.length})</span>}
        </h2>
        {!allLoaded && (
          <button
            onClick={() => void loadAllEvents()}
            disabled={loadingAll}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            {loadingAll && <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
            {loadingAll ? 'Loading…' : 'View all 50 events'}
          </button>
        )}
      </div>
      {eventsError && (
        <p className="text-xs text-red-500 mb-3">{eventsError}</p>
      )}
      {allLoaded && events.length > 10 && (
        <div className="mb-3">
          <button onClick={() => setExpanded((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
            {expanded ? 'Show less' : `Show all ${events.length}`}
          </button>
        </div>
      )}
      <div className="space-y-2">
        {displayed.map((event, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${event.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700">{event.event.replace(/_/g, ' ')}</p>
              {event.errorMessage && <p className="text-xs text-red-500 mt-0.5">{event.errorMessage}</p>}
            </div>
            <span className="text-xs text-gray-400 shrink-0">{new Date(event.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const opConfig: Record<PowerOp, { label: string; variant: 'danger' | 'warning'; description: string }> = {
  start:       { label: 'Start VM',       variant: 'warning', description: 'This will power on the VM.' },
  stop:        { label: 'Stop VM',        variant: 'warning', description: 'This will gracefully shut down the VM.' },
  'force-stop':{ label: 'Force Stop',     variant: 'danger',  description: 'This will immediately kill the VM. Unsaved data may be lost.' },
  restart:     { label: 'Restart VM',     variant: 'warning', description: 'This will gracefully reboot the VM.' },
  reset:       { label: 'Reset VM',       variant: 'danger',  description: 'This will hard reset the VM. Unsaved data may be lost.' },
  delete:      { label: 'Delete VM',      variant: 'danger',  description: 'This will permanently delete the VM and all its data. This cannot be undone.' },
};

export default function VMDetailPage() {
  const { vmId } = useParams<{ vmId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { toasts, addToast, dismiss } = useToast();

  const [details, setDetails] = useState<VMDetails | null>(null);
  const [liveStatus, setLiveStatus] = useState<VMLiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingOp, setPendingOp] = useState<PowerOp | null>(null);
  const [opLoading, setOpLoading] = useState(false);
  const [virtLoading, setVirtLoading] = useState(false);

  const load = useCallback(async () => {
    if (!vmId || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVMDetails(vmId);
      setDetails(data);
      if (data.liveStatus) setLiveStatus(data.liveStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VM details.');
    } finally {
      setLoading(false);
    }
  }, [vmId, isAuthenticated]);

  const refreshLive = useCallback(async () => {
    if (!vmId) return;
    setLiveLoading(true);
    try {
      const status = await fetchVMStatus(vmId);
      setLiveStatus(status);
    } catch {
      // best-effort
    } finally {
      setLiveLoading(false);
    }
  }, [vmId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh live status every 10s while VM is in a transitional state
  useEffect(() => {
    const transitional = new Set(['creating', 'deleting', 'running']);
    if (!details || !transitional.has(details.vm.status)) return;
    const id = setInterval(() => void refreshLive(), 10_000);
    return () => clearInterval(id);
  }, [details?.vm.status, refreshLive]);

  const hyperVStatus: HyperVStatus = details?.vm.hyperVStatus ?? 'disabled';
  const isVirtInProgress =
    hyperVStatus === 'pending' || hyperVStatus === 'enabling' || hyperVStatus === 'disabling';

  const isSoftwareInProgress = details?.vm.softwareInstalls?.some(
    (s) => s.status === 'pending' || s.status === 'installing'
  ) ?? false;

  // While Hyper-V is being applied, poll on a backoff (5s → 10s → 20s → 30s cap)
  // and stop automatically once it reaches a terminal state (enabled/failed).
  useEffect(() => {
    if (!isVirtInProgress) return;
    let cancelled = false;
    let delay = 5_000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      delay = Math.min(delay * 2, 30_000);
      timer = setTimeout(() => void tick(), delay);
    };
    timer = setTimeout(() => void tick(), delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isVirtInProgress, load]);

  // Poll while any software install is in progress (same backoff pattern)
  useEffect(() => {
    if (!isSoftwareInProgress) return;
    let cancelled = false;
    let delay = 10_000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      delay = Math.min(delay * 2, 30_000);
      timer = setTimeout(() => void tick(), delay);
    };
    timer = setTimeout(() => void tick(), delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isSoftwareInProgress, load]);

  async function handleVirtEnable() {
    if (!vmId) return;
    setVirtLoading(true);
    try {
      await enableVirtualization(vmId);
      addToast('success', 'Enabling virtualization. This can take a few minutes.');
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to enable virtualization.');
    } finally {
      setVirtLoading(false);
    }
  }

  async function handleVirtDisable() {
    if (!vmId) return;
    setVirtLoading(true);
    try {
      await disableVirtualization(vmId);
      addToast('success', 'Disabling virtualization. This can take a few minutes.');
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to disable virtualization.');
    } finally {
      setVirtLoading(false);
    }
  }

  async function handleOp(op: PowerOp) {
    if (!vmId) return;
    setOpLoading(true);
    try {
      if (op === 'delete') {
        await deleteVM(vmId);
        addToast('success', 'VM deleted successfully.');
        router.push('/dashboard/admin/vms');
        return;
      }
      const fn = { start: startVM, stop: stopVM, 'force-stop': forceStopVM, restart: restartVM, reset: resetVM }[op];
      await fn(vmId);
      addToast('success', `VM ${op} successful.`);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${op} VM.`);
    } finally {
      setOpLoading(false);
      setPendingOp(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="max-w-4xl">
        <Link href="/dashboard/admin/vms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to VMs
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">{error ?? 'VM not found.'}</p>
        </div>
      </div>
    );
  }

  const vm = details.vm;
  const live = liveStatus;
  const isRunning = vm.status === 'running';
  const isStopped = vm.status === 'stopped';

  return (
    <div className="max-w-4xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Confirm modal */}
      {pendingOp && (
        <ConfirmModal
          open
          title={opConfig[pendingOp].label}
          description={opConfig[pendingOp].description}
          confirmLabel={opConfig[pendingOp].label}
          confirmVariant={opConfig[pendingOp].variant}
          loading={opLoading}
          onConfirm={() => void handleOp(pendingOp)}
          onCancel={() => setPendingOp(null)}
        />
      )}

      {/* Back + header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/dashboard/admin/vms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-2">
            <ChevronLeft className="w-4 h-4" /> Back to VMs
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{vm.name}</h1>
            <VMStatusBadge status={vm.status} />
            {(vm.enableVirtualization || hyperVStatus !== 'disabled') && (
              <HyperVStatusBadge status={hyperVStatus} />
            )}
          </div>
          <p className="text-gray-400 text-sm mt-0.5 font-mono">#{vm.vmid} · {vm.node}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={refreshLive}
            disabled={liveLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {(() => {
            const consoleProtocol = pickConsoleProtocol(vm.name, details.vm.name);
            const consoleHref = `/dashboard/admin/vms/${vmId}/console?protocol=${consoleProtocol}`;
            return isRunning ? (
              <Link
                href={consoleHref}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition"
                title={`Open browser console (${consoleProtocol.toUpperCase()})`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Console
              </Link>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="VM must be running"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-lg cursor-not-allowed opacity-60"
              >
                <Monitor className="w-3.5 h-3.5" />
                Console
              </button>
            );
          })()}
          {isStopped && (
            <button onClick={() => setPendingOp('start')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
              <Play className="w-3.5 h-3.5" /> Start
            </button>
          )}
          {isRunning && (
            <>
              <button onClick={() => setPendingOp('stop')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition">
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
              <button onClick={() => setPendingOp('force-stop')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 rounded-lg transition">
                <Zap className="w-3.5 h-3.5" /> Force Stop
              </button>
              <button onClick={() => setPendingOp('restart')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition">
                <RotateCcw className="w-3.5 h-3.5" /> Restart
              </button>
              <button onClick={() => setPendingOp('reset')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 rounded-lg transition">
                <RefreshCw className="w-3.5 h-3.5" /> Reset
              </button>
            </>
          )}
          <button onClick={() => setPendingOp('delete')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Live status */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" /> Live Status
            </h2>
            {!live && <span className="text-xs text-gray-400">Start VM to see live metrics</span>}
          </div>
          {live ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> CPU</span>
                  <span className="text-xs text-gray-600">{live.cpu.allocated} vCPU allocated</span>
                </div>
                <UsageBar pct={live.cpu.usagePercent} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5"><MemoryStick className="w-3.5 h-3.5" /> Memory</span>
                  <span className="text-xs text-gray-600">{live.memory.usedGb.toFixed(2)} / {live.memory.allocatedGb.toFixed(1)} GB</span>
                </div>
                <UsageBar pct={live.memory.usagePercent} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Disk</span>
                  <span className="text-xs text-gray-600">{live.disk.usedGb.toFixed(2)} / {live.disk.allocatedGb.toFixed(1)} GB</span>
                </div>
                <UsageBar pct={live.disk.allocatedGb > 0 ? (live.disk.usedGb / live.disk.allocatedGb) * 100 : 0} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">IP Address</p>
                    <p className="text-xs font-mono text-gray-700">{live.ipAddress ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Uptime</p>
                    <p className="text-xs text-gray-700">{live.uptime.formatted}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Cpu className="w-3.5 h-3.5" />, label: 'CPU', value: `${vm.allocatedCpu} vCPU` },
                { icon: <MemoryStick className="w-3.5 h-3.5" />, label: 'RAM', value: `${vm.allocatedMemoryGb} GB` },
                { icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Disk', value: `${vm.allocatedDiskGb} GB` },
                { icon: <Network className="w-3.5 h-3.5" />, label: 'IP', value: vm.ipAddress ?? '—' },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-400">{icon}</span>
                  <div>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-xs font-medium text-gray-700">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* VM info */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-gray-400" /> VM Info
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Template', value: vm.name },
              { label: 'Clone Type', value: <CloneTypeBadge type={vm.cloneType} /> },
              { label: 'Node', value: vm.node },
              { label: 'VMID', value: <span className="font-mono">{vm.vmid}</span> },
              { label: 'HA', value: vm.haEnabled ? 'Enabled' : 'Disabled' },
              { label: 'Virtualization', value: <HyperVStatusBadge status={hyperVStatus} /> },
              { label: 'Created', value: new Date(vm.createdAt).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{label}</span>
                <span className="text-xs text-gray-700">{value}</span>
              </div>
            ))}

            {/* Virtualization actions */}
            <div className="pt-3 border-t border-gray-50 space-y-2">
              {hyperVStatus === 'failed' && vm.hyperVLastError && (
                <p className="text-xs text-red-600 break-words">{vm.hyperVLastError}</p>
              )}
              {isVirtInProgress && (
                <p className="text-xs text-amber-600">
                  {hyperVStatus === 'disabling'
                    ? 'Disabling virtualization… this can take a few minutes.'
                    : 'Applying virtualization… this can take a few minutes.'}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {!isVirtInProgress && (hyperVStatus === 'disabled' || hyperVStatus === 'failed') && (
                  <button
                    type="button"
                    onClick={() => void handleVirtEnable()}
                    disabled={virtLoading}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  >
                    {virtLoading ? 'Working…' : hyperVStatus === 'failed' ? 'Retry enable' : 'Enable virtualization'}
                  </button>
                )}
                {!isVirtInProgress && hyperVStatus === 'enabled' && (
                  <button
                    type="button"
                    onClick={() => void handleVirtDisable()}
                    disabled={virtLoading}
                    className="text-xs font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
                  >
                    {virtLoading ? 'Working…' : 'Disable virtualization'}
                  </button>
                )}
              </div>
            </div>

            {vm.description && (
              <div className="pt-2 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-1">Description</p>
                <p className="text-xs text-gray-600">{vm.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Software installs */}
      {vm.softwareInstalls && vm.softwareInstalls.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Software</h2>
          <div className="space-y-2">
            {vm.softwareInstalls.map((sw, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs font-medium text-gray-700">{sw.name}</span>
                <div className="flex items-center gap-2">
                  {sw.status === 'installed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                      Installed
                    </span>
                  )}
                  {sw.status === 'installing' && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      <span className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Installing
                    </span>
                  )}
                  {sw.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      Pending
                    </span>
                  )}
                  {sw.status === 'failed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700" title={sw.lastError}>
                      Failed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {vm.softwareInstalls.some((s) => s.status === 'installing' || s.status === 'pending') && (
            <p className="text-xs text-amber-600 mt-3">Software installation in progress — this can take a few minutes.</p>
          )}
        </div>
      )}

      {/* Event timeline */}
      {details.recentEvents.length > 0 && (
        <VMEventsSection vmId={vmId} initialEvents={details.recentEvents} />
      )}
    </div>
  );
}
