'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { fetchMyAssignedVMs, type IVM } from '../../../lib/vmApi';
import { ApiError } from '../../../lib/apiClient';
import { Server, Cpu, MemoryStick, HardDrive, Globe } from 'lucide-react';

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-400',
    paused: 'bg-yellow-400',
    error: 'bg-red-500',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${map[status] ?? 'bg-gray-400'}`} />
  );
}

function VMCard({ vm }: { vm: IVM }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{vm.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{vm.node}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusDot status={vm.status} />
          <span className="text-xs text-gray-500 capitalize">{vm.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
          <Cpu className="w-3.5 h-3.5 text-gray-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-gray-900">{vm.allocatedCpu}</p>
          <p className="text-xs text-gray-400">vCPU</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
          <MemoryStick className="w-3.5 h-3.5 text-gray-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-gray-900">{vm.allocatedMemoryGb} GB</p>
          <p className="text-xs text-gray-400">RAM</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
          <HardDrive className="w-3.5 h-3.5 text-gray-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-gray-900">{vm.allocatedDiskGb} GB</p>
          <p className="text-xs text-gray-400">Disk</p>
        </div>
      </div>

      {vm.ipAddress && (
        <div className="flex items-center gap-2 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <Globe className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-mono">{vm.ipAddress}</span>
        </div>
      )}
    </div>
  );
}

export default function UserDashboard() {
  const { user } = useAuth();
  const [vms, setVMs] = useState<IVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchMyAssignedVMs();
        setVMs(result);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load VMs.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-screen-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-0.5">{user.email}</p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          {loading ? 'Loading VMs...' : `My VMs (${vms.length})`}
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-600 text-center">
          {error}
        </div>
      ) : vms.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Server className="w-7 h-7 text-blue-500" />
          </div>
          <p className="text-gray-700 font-medium">No VMs assigned yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Your administrator will assign virtual machines to your account.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vms.map((vm) => (
            <VMCard key={vm._id} vm={vm} />
          ))}
        </div>
      )}
    </div>
  );
}
