'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchExternalVM, type IExternalVM } from '../../../../../lib/externalVmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { ChevronLeft, Monitor, Loader2, Server, Globe } from 'lucide-react';

export default function UserExternalServerPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.serverId as string;

  const [server, setServer] = useState<IExternalVM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExternalVM(serverId);
      setServer(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load server.');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openConsole() {
    setConsoleLoading(true);
    try {
      router.push(`/dashboard/user/servers/${serverId}/console`);
    } finally {
      setConsoleLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="max-w-screen-xl">
        <p className="text-red-600 text-sm">{error ?? 'Server not found.'}</p>
        <Link href="/dashboard/user" className="text-sm text-[#B91C1C] mt-4 inline-block">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl">
      <Link href="/dashboard/user" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to My Dashboard
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{server.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Elastic Server Import</p>
          </div>
          <button
            onClick={() => void openConsole()}
            disabled={
              consoleLoading || Boolean(server.myAccess && !server.myAccess.allowedNow)
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#B91C1C] hover:bg-red-700 text-white text-sm font-medium rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40"
            title={
              server.myAccess && !server.myAccess.allowedNow
                ? server.myAccess.nextWindow
                  ? `Outside access window. Next: ${server.myAccess.nextWindow}`
                  : 'Outside your access window'
                : 'Open console'
            }
          >
            {consoleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
            Open Console
          </button>
        </div>

        <div className="p-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <Globe className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">IP Address</p>
              <p className="text-sm font-mono font-medium text-gray-900">{server.ipAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <Server className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Protocol</p>
              <p className="text-sm font-medium text-gray-900 uppercase">{server.protocol}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg sm:col-span-2">
            <div>
              <p className="text-xs text-gray-500">Username</p>
              <p className="text-sm font-medium text-gray-900">{server.username}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
