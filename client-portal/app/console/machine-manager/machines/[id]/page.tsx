'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../context/AuthContext';
import { useSoftwareCatalog } from '../../../../../hooks/useSoftwareCatalog';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import { ApiError } from '../../../../../lib/apiClient';
import {
  fetchMachine,
  createJobs,
  type IMachine,
  type MachineStatus,
} from '../../../../../lib/machineManagerApi';
import {
  Server, ArrowLeft, Cpu, HardDrive, MemoryStick,
  Monitor, CheckCircle2, Loader2, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

function StatusBadge({ status }: { status: MachineStatus }) {
  const cfg: Record<MachineStatus, { label: string; dot: string; badge: string }> = {
    pending: { label: 'Pending', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    online:  { label: 'Online',  dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' },
    offline: { label: 'Offline', dot: 'bg-red-400',   badge: 'bg-red-50 text-red-600 border-red-200' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function SpecCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { addToast, toasts, dismiss } = useToast();
  const { catalog, loading: catalogLoading } = useSoftwareCatalog(isAuthenticated);

  const [machine, setMachine] = useState<IMachine | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await fetchMachine(id);
      setMachine(m);
    } catch {
      addToast('error', 'Failed to load machine.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  const toggle = (swId: string) =>
    setSelected((prev) => prev.includes(swId) ? prev.filter((s) => s !== swId) : [...prev, swId]);

  const handleInstall = async () => {
    if (!selected.length || !machine) return;
    setInstalling(true);
    try {
      await createJobs({ machineIds: [machine._id], softwareIds: selected });
      addToast('success', `${selected.length} install job(s) queued.`);
      setSelected([]);
      router.push('/console/machine-manager/jobs');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to queue jobs.');
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!machine) return null;

  const specs = machine.specs;
  // Filter catalog to OS-compatible software
  const compatible = catalog.filter((sw) => sw.supportedOS.includes(machine.os));

  return (
    <div className="max-w-4xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Back */}
      <Link href="/console/machine-manager/machines"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> My Machines
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{machine.name}</h1>
            <p className="mt-0.5 font-mono text-sm text-gray-400">{machine.ipAddress}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={machine.status} />
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Machine info */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Machine Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 text-sm">
          {[
            ['OS', machine.os],
            ['Agent ID', machine.agentId || '—'],
            ['Last Seen', machine.lastSeen ? new Date(machine.lastSeen).toLocaleString() : '—'],
            ['Added', new Date(machine.createdAt).toLocaleString()],
          ].map(([label, val]) => (
            <div key={label}>
              <dt className="text-xs text-gray-400">{label}</dt>
              <dd className="mt-0.5 font-medium text-gray-900 capitalize truncate">{val}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Specs */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">System Specs</h2>
        {specs ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SpecCard icon={Monitor}     label="Hostname"  value={specs.hostname  ?? '—'} />
            <SpecCard icon={Cpu}         label="CPU Cores" value={specs.cpuCores != null ? `${specs.cpuCores} cores` : '—'} />
            <SpecCard icon={MemoryStick} label="RAM"       value={specs.ramGb    != null ? `${specs.ramGb} GB` : '—'} />
            <SpecCard icon={HardDrive}   label="Disk (C:)" value={specs.diskGb   != null ? `${specs.diskGb} GB` : '—'} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Specs will appear after the next heartbeat (~30s).</p>
        )}
      </div>

      {/* Install Software */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Install Software</h2>
          {selected.length > 0 && (
            <button
              onClick={() => void handleInstall()}
              disabled={installing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
            >
              {installing
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Installing…</>
                : <><CheckCircle2 className="h-4 w-4" /> Install {selected.length} item{selected.length !== 1 ? 's' : ''}</>
              }
            </button>
          )}
        </div>

        {catalogLoading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
        ) : compatible.length === 0 ? (
          <p className="text-sm text-gray-400">No software available for {machine.os}.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {compatible.map((sw) => {
              const isSelected = selected.includes(sw._id);
              return (
                <button
                  key={sw._id}
                  type="button"
                  onClick={() => toggle(sw._id)}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isSelected
                      ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div>
                    <p className="font-medium">{sw.name}</p>
                    <p className="text-xs text-gray-400">{sw.version} · {sw.installMethod}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
