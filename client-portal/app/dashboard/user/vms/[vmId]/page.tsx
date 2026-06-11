'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchVMDetails,
  fetchVMStatus,
  startVM,
  stopVM,
  restartVM,
  type VMDetails,
  type VMLiveStatus,
} from '../../../../../lib/vmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { VMStatusBadge, UsageBar } from '../../../../../components/dashboard/VMStatusBadge';
import { ConfirmModal } from '../../../../../components/ui/ConfirmModal';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import {
  ChevronLeft,
  Play,
  Square,
  RotateCcw,
  Monitor,
  Loader2,
  Cpu,
  MemoryStick,
  HardDrive,
  Globe,
  Server,
  RefreshCw,
  Network,
  Clock,
  Copy,
  Check,
  Activity,
  CalendarClock,
} from 'lucide-react';

type PowerOp = 'start' | 'stop' | 'restart';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition shrink-0"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const btnRefresh =
  'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B91C1C] bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition disabled:opacity-40';
const btnOutline =
  'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnPrimary =
  'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#B91C1C] hover:bg-[#DC2626] rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnSoftRed =
  'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B91C1C] bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed';

export default function UserVMDetailPage() {
  const { vmId } = useParams<{ vmId: string }>();
  const { toasts, addToast, dismiss } = useToast();

  const [details, setDetails] = useState<VMDetails | null>(null);
  const [liveStatus, setLiveStatus] = useState<VMLiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOp, setPendingOp] = useState<PowerOp | null>(null);
  const [opLoading, setOpLoading] = useState(false);

  const loadDetails = useCallback(
    async (silent = false) => {
      if (!vmId) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchVMDetails(vmId);
        setDetails(data);
        if (data.liveStatus) setLiveStatus(data.liveStatus);
      } catch (err) {
        if (!silent) {
          setError(err instanceof ApiError ? err.message : 'Failed to load VM.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [vmId]
  );

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

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadDetails(true), refreshLive()]);
  }, [loadDetails, refreshLive]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (!details || details.vm.status !== 'running' || details.vm.consoleReady) return;
    const timer = setInterval(() => void loadDetails(true), 5000);
    return () => clearInterval(timer);
  }, [details, loadDetails]);

  const handlePowerOp = async (op: PowerOp) => {
    if (!vmId) return;
    setOpLoading(true);
    try {
      if (op === 'start') await startVM(vmId);
      else if (op === 'stop') await stopVM(vmId);
      else await restartVM(vmId);
      addToast(
        'success',
        op === 'start' ? 'VM started.' : op === 'stop' ? 'VM stopped.' : 'VM restarted.'
      );
      setPendingOp(null);
      await loadDetails(true);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${op} VM.`);
    } finally {
      setOpLoading(false);
    }
  };

  if (loading && !details) {
    return (
      <div className="max-w-4xl">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="h-9 w-56 bg-gray-200 rounded animate-pulse mb-6" />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-64 bg-white border border-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="max-w-4xl">
        <Link
          href="/dashboard/user"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to My VMs
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
  const consoleReady = isRunning && vm.consoleReady === true;
  const consolePreparing = isRunning && vm.consoleReady !== true;
  const consoleProtocol = vm.consoleProtocol ?? 'rdp';
  const consoleHref = `/dashboard/user/vms/${vmId}/console?protocol=${consoleProtocol}`;
  const automationManaged = vm.automationManaged === true;
  const schedule = vm.automationSchedule;

  return (
    <div className="max-w-4xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {pendingOp && (
        <ConfirmModal
          open
          title={
            pendingOp === 'start' ? 'Start VM' : pendingOp === 'stop' ? 'Stop VM' : 'Restart VM'
          }
          description={
            pendingOp === 'start'
              ? `Start ${vm.name}?`
              : pendingOp === 'stop'
                ? `Gracefully stop ${vm.name}?`
                : `Restart ${vm.name}? The VM will reboot.`
          }
          confirmLabel={
            pendingOp === 'start' ? 'Start' : pendingOp === 'stop' ? 'Stop' : 'Restart'
          }
          confirmVariant="warning"
          loading={opLoading}
          onConfirm={() => void handlePowerOp(pendingOp)}
          onCancel={() => setPendingOp(null)}
        />
      )}

      {automationManaged && schedule && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Scheduled lab — {schedule.name}</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Power is managed automatically: resume at {schedule.startTime}, hibernate at{' '}
              {schedule.stopTime} ({schedule.timezone}). Start, stop, and restart are disabled.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/dashboard/user"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#B91C1C] mb-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to My VMs
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{vm.name}</h1>
            <VMStatusBadge status={vm.status} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={loading || liveLoading}
              className={btnRefresh}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {consoleReady && (
              <Link href={consoleHref} className={btnPrimary}>
                <Monitor className="w-3.5 h-3.5" />
                Console
              </Link>
            )}
            {consolePreparing && (
              <button type="button" disabled className={btnOutline}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Console
              </button>
            )}
            {!isRunning && !consolePreparing && (
              <button type="button" disabled className={btnOutline}>
                <Monitor className="w-3.5 h-3.5" />
                Console
              </button>
            )}
            {isStopped && !automationManaged && (
              <button type="button" onClick={() => setPendingOp('start')} className={btnPrimary}>
                <Play className="w-3.5 h-3.5" />
                Start
              </button>
            )}
            {isRunning && !automationManaged && (
              <>
                <button type="button" onClick={() => setPendingOp('stop')} className={btnOutline}>
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
                <button type="button" onClick={() => setPendingOp('restart')} className={btnSoftRed}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restart
                </button>
              </>
            )}
          </div>
          {consolePreparing && (
            <p className="text-xs text-[#B91C1C] max-w-xs text-right">
              VM is booting. Console will be available shortly.
            </p>
          )}
        </div>
      </div>


      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live status / resources */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              {live ? 'Live Status' : 'Resources'}
            </h2>
            {!live && !isRunning && (
              <span className="text-xs text-gray-400">Start VM to see live metrics</span>
            )}
          </div>
          {live ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> CPU
                  </span>
                  <span className="text-xs text-gray-600">{live.cpu.allocated} vCPU allocated</span>
                </div>
                <UsageBar pct={live.cpu.usagePercent} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <MemoryStick className="w-3.5 h-3.5" /> Memory
                  </span>
                  <span className="text-xs text-gray-600">
                    {live.memory.usedGb.toFixed(2)} / {live.memory.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <UsageBar pct={live.memory.usagePercent} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5" /> Disk
                  </span>
                  <span className="text-xs text-gray-600">
                    {live.disk.usedGb.toFixed(2)} / {live.disk.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <UsageBar
                  pct={
                    live.disk.allocatedGb > 0
                      ? (live.disk.usedGb / live.disk.allocatedGb) * 100
                      : 0
                  }
                />
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
            <div className="space-y-3">
              {[
                { label: 'vCPU', value: `${vm.allocatedCpu} cores` },
                { label: 'Memory', value: `${vm.allocatedMemoryGb} GB` },
                { label: 'Disk', value: `${vm.allocatedDiskGb} GB` },
                { label: 'IP Address', value: vm.ipAddress ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className={`text-xs text-gray-700 ${label === 'IP Address' ? 'font-mono' : 'font-medium'}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overview + Network */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-gray-400" />
              Overview
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Status', value: <VMStatusBadge status={vm.status} /> },
                { label: 'vCPU', value: `${vm.allocatedCpu}` },
                { label: 'Memory', value: `${vm.allocatedMemoryGb} GB` },
                { label: 'Disk', value: `${vm.allocatedDiskGb} GB` },
                { label: 'Created', value: new Date(vm.createdAt).toLocaleDateString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-xs text-gray-700">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Network className="w-4 h-4 text-gray-400" />
              Network
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">IP Address</span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs font-mono text-gray-700 truncate">
                    {vm.ipAddress ?? '—'}
                  </span>
                  {vm.ipAddress && <CopyButton value={vm.ipAddress} label="IP address" />}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">Protocol</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {consoleProtocol.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
