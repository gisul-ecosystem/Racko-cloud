'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchVMDetails,
  startVM,
  stopVM,
  restartVM,
  type VMDetails,
} from '../../../../../lib/vmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { VMStatusBadge } from '../../../../../components/dashboard/VMStatusBadge';
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
} from 'lucide-react';

type PowerOp = 'start' | 'stop' | 'restart';

export default function UserVMDetailPage() {
  const { vmId } = useParams<{ vmId: string }>();
  const { toasts, addToast, dismiss } = useToast();

  const [details, setDetails] = useState<VMDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingOp, setPendingOp] = useState<PowerOp | null>(null);
  const [opLoading, setOpLoading] = useState(false);

  const loadDetails = useCallback(async (silent = false) => {
    if (!vmId) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await fetchVMDetails(vmId);
      setDetails(data);
    } catch (err) {
      if (!silent) {
        setError(err instanceof ApiError ? err.message : 'Failed to load VM.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [vmId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  // Poll while VM is running but console is not ready yet.
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
      await loadDetails();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : `Failed to ${op} VM.`);
    } finally {
      setOpLoading(false);
    }
  };

  if (loading && !details) {
    return (
      <div className="max-w-2xl">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="bg-white border border-gray-200 rounded-xl p-8 animate-pulse h-64" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="max-w-2xl">
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
  const isRunning = vm.status === 'running';
  const isStopped = vm.status === 'stopped';
  const consoleReady = isRunning && vm.consoleReady === true;
  const consolePreparing = isRunning && vm.consoleReady !== true;
  const consoleProtocol = vm.consoleProtocol ?? 'rdp';
  const consoleHref = `/dashboard/user/vms/${vmId}/console?protocol=${consoleProtocol}`;

  return (
    <div className="max-w-2xl">
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

      <Link
        href="/dashboard/user"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back to My VMs
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{vm.name}</h1>
            <VMStatusBadge status={vm.status} />
          </div>
          <p className="text-gray-400 text-sm mt-0.5 font-mono">#{vm.vmid} · {vm.node}</p>
        </div>
      </div>

      {/* Specifications */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Server className="w-4 h-4 text-gray-400" />
          Specifications
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg px-3 py-3 text-center">
            <Cpu className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
            <p className="text-lg font-semibold text-gray-900">{vm.allocatedCpu}</p>
            <p className="text-xs text-gray-400">vCPU</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-3 text-center">
            <MemoryStick className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
            <p className="text-lg font-semibold text-gray-900">{vm.allocatedMemoryGb} GB</p>
            <p className="text-xs text-gray-400">RAM</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-3 text-center">
            <HardDrive className="w-4 h-4 text-gray-400 mx-auto mb-1.5" />
            <p className="text-lg font-semibold text-gray-900">{vm.allocatedDiskGb} GB</p>
            <p className="text-xs text-gray-400">Disk</p>
          </div>
        </div>
        {vm.ipAddress && (
          <div className="flex items-center gap-2 text-sm text-gray-600 border-t border-gray-100 mt-4 pt-4">
            <Globe className="w-4 h-4 text-gray-400" />
            <span className="font-mono">{vm.ipAddress}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {consoleReady && (
            <Link
              href={consoleHref}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              <Monitor className="w-4 h-4" />
              Console
            </Link>
          )}
          {consolePreparing && (
            <button
              type="button"
              disabled
              title="Preparing console access… This takes 1–2 minutes after first start"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Console
            </button>
          )}
          {!isRunning && !consolePreparing && (
            <button
              type="button"
              disabled
              title="VM must be running"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
            >
              <Monitor className="w-4 h-4" />
              Console
            </button>
          )}
          {isStopped && (
            <button
              type="button"
              onClick={() => setPendingOp('start')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          )}
          {isRunning && (
            <>
              <button
                type="button"
                onClick={() => setPendingOp('stop')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
              <button
                type="button"
                onClick={() => setPendingOp('restart')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
            </>
          )}
        </div>
        {consolePreparing && (
          <p className="text-xs text-blue-600 mt-3">
            VM is booting and setting up credentials. Console will be available shortly.
          </p>
        )}
      </div>
    </div>
  );
}
