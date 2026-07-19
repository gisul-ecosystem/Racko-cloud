'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Plus,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  Unlock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  fetchIpPoolStats,
  fetchIpList,
  addSubnet,
  releaseIp,
  type IpPoolStats,
  type IpRecord,
  type IpListResponse,
} from '../../../../lib/ipPoolApi';

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const statusConfig = {
  available: { label: 'Available', className: 'bg-green-100 text-green-700' },
  assigned: { label: 'Assigned', className: 'bg-blue-100 text-blue-700' },
  reserved: { label: 'Reserved', className: 'bg-yellow-100 text-yellow-700' },
} as const;

function StatusBadge({ status }: { status: IpRecord['status'] }) {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ─── Add Subnet Form ─────────────────────────────────────────────────────────

function AddSubnetForm({ onSuccess }: { onSuccess: () => void }) {
  const [cidr, setCidr] = useState('');
  const [gateway, setGateway] = useState('');
  const [excludedIps, setExcludedIps] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string>('');

  // When gateway changes, ensure it appears in the excluded IPs field
  function handleGatewayChange(value: string) {
    setGateway(value);
    const trimmed = value.trim();
    if (!trimmed) return;
    // Simple IPv4 check before auto-populating
    const isValidIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed);
    if (!isValidIp) return;
    setExcludedIps((prev) => {
      const parts = prev.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.includes(trimmed)) return prev;
      return parts.length > 0 ? `${parts.join(', ')}, ${trimmed}` : trimmed;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult('');

    const excluded = excludedIps
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const res = await addSubnet({ cidr: cidr.trim(), gateway: gateway.trim(), excludedIps: excluded });
      setResult(
        `Done — ${res.inserted} IPs added, ${res.alreadyExisted} already existed, ${res.excluded} excluded.`
      );
      setCidr('');
      setGateway('');
      setExcludedIps('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add subnet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Add IP Subnet</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">
            Subnet (CIDR notation)
          </label>
          <input
            type="text"
            placeholder="e.g. 103.99.38.0/24"
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Gateway</label>
          <input
            type="text"
            placeholder="e.g. 103.99.38.1"
            value={gateway}
            onChange={(e) => handleGatewayChange(e.target.value)}
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">
            Excluded IPs{' '}
            <span className="font-normal text-gray-400">(comma-separated, optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. 103.99.38.1, 103.99.38.169"
            value={excludedIps}
            onChange={(e) => setExcludedIps(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
          <p className="text-xs text-gray-400">
            Gateway is auto-added. Add any other IPs to skip (Proxmox host, broadcast, etc).
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
        {result && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{result}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {loading ? 'Adding…' : 'Add Subnet'}
        </button>
      </form>
    </div>
  );
}

// ─── IP Table ─────────────────────────────────────────────────────────────────

function IpTable({
  data,
  loading,
  onRelease,
  onPageChange,
  statusFilter,
  onStatusFilterChange,
}: {
  data: IpListResponse | null;
  loading: boolean;
  onRelease: (ip: string) => Promise<void>;
  onPageChange: (page: number) => void;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
}) {
  const [releasingIp, setReleasingIp] = useState<string | null>(null);

  async function handleRelease(ip: string) {
    setReleasingIp(ip);
    await onRelease(ip);
    setReleasingIp(null);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Table header / filter bar */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">IP Pool</h2>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#B91C1C] focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="reserved">Reserved</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
              <th className="px-5 py-3 text-left">IP Address</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">VM</th>
              <th className="px-5 py-3 text-left">Assigned At</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && !data && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-3"><div className="h-3 w-28 rounded bg-gray-200" /></td>
                  <td className="px-5 py-3"><div className="h-3 w-16 rounded bg-gray-200" /></td>
                  <td className="px-5 py-3"><div className="h-3 w-24 rounded bg-gray-200" /></td>
                  <td className="px-5 py-3"><div className="h-3 w-28 rounded bg-gray-200" /></td>
                  <td className="px-5 py-3" />
                </tr>
              ))
            )}
            {!loading && data?.ips.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  No IPs found.
                </td>
              </tr>
            )}
            {data?.ips.map((record) => (
              <tr key={record._id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-mono text-xs font-medium text-gray-900">
                  {record.ip}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={record.status} />
                </td>
                <td className="px-5 py-3 text-xs text-gray-600">
                  {record.vmName ?? (record.vmId ? (
                    <span className="font-mono text-gray-400">{record.vmId.slice(-8)}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  ))}
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {record.assignedAt
                    ? new Date(record.assignedAt).toLocaleString()
                    : record.reservedAt
                      ? <span className="text-yellow-600">Reserved {new Date(record.reservedAt).toLocaleString()}</span>
                      : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  {record.status !== 'available' && (
                    <button
                      onClick={() => handleRelease(record.ip)}
                      disabled={releasingIp === record.ip}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:opacity-50"
                    >
                      {releasingIp === record.ip ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-500">
            {((data.page - 1) * data.limit) + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(data.page - 1)}
              disabled={data.page <= 1}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs text-gray-600">
              Page {data.page} of {data.pages}
            </span>
            <button
              onClick={() => onPageChange(data.page + 1)}
              disabled={data.page >= data.pages}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IpManagementPage() {
  const [stats, setStats] = useState<IpPoolStats | null>(null);
  const [ipData, setIpData] = useState<IpListResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [releaseError, setReleaseError] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchIpPoolStats();
      setStats(s);
    } catch {
      // non-fatal
    }
  }, []);

  const loadIps = useCallback(async (p: number, status: string) => {
    setTableLoading(true);
    try {
      const data = await fetchIpList({ page: p, limit: 50, status: status || undefined });
      setIpData(data);
    } catch {
      // non-fatal
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    void loadIps(page, statusFilter);
  }, [loadStats, loadIps, page, statusFilter]);

  function handleStatusFilterChange(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  async function handleRelease(ip: string) {
    setReleaseError('');
    try {
      await releaseIp(ip);
      await Promise.all([loadStats(), loadIps(page, statusFilter)]);
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : 'Failed to release IP.');
    }
  }

  function handleSubnetAdded() {
    void loadStats();
    void loadIps(1, statusFilter);
    setPage(1);
  }

  return (
    <div className="max-w-screen-xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IP Pool Management</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Manage public IP addresses available for VM assignment
          </p>
        </div>
        <button
          onClick={() => { void loadStats(); void loadIps(page, statusFilter); }}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total IPs"
          value={stats?.total ?? 0}
          icon={Globe}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          label="Available"
          value={stats?.available ?? 0}
          icon={CheckCircle}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          label="Assigned"
          value={stats?.assigned ?? 0}
          icon={XCircle}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          label="Reserved"
          value={stats?.reserved ?? 0}
          icon={Clock}
          color="bg-yellow-100 text-yellow-600"
        />
      </div>

      {/* Add subnet form */}
      <AddSubnetForm onSuccess={handleSubnetAdded} />

      {/* Release error */}
      {releaseError && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{releaseError}</p>
      )}

      {/* IP table */}
      <IpTable
        data={ipData}
        loading={tableLoading}
        onRelease={handleRelease}
        onPageChange={(p) => setPage(p)}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
      />
    </div>
  );
}
