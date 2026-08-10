'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Users,
  UserCog,
} from 'lucide-react';
import { fetchSuperAdminOverview } from '../../../lib/tenantApi';
import type { SuperAdminOverview } from '../../../lib/tenantTypes';
import { ApiError } from '../../../lib/apiClient';

const SERVICE_LABELS: Record<string, string> = {
  'vm-management': 'VPS Hosting',
  'create-vm': 'VM Catalog',
  'dedicated-server': 'Dedicated Servers',
  'elastic-servers': 'Elastic Servers',
  azure: 'Azure',
  aws: 'AWS',
  gcp: 'GCP',
  'cloud-labs': 'Cloud Labs',
  'machine-manager': 'Machine Manager',
  docs: 'Documentation',
  unknown: 'Other',
};

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactMoney(amount: number, currency: string): string {
  if (amount >= 10000000) {
    return `${currency} ${(amount / 10000000).toFixed(2)}Cr`;
  }
  if (amount >= 100000) {
    return `${currency} ${(amount / 100000).toFixed(2)}L`;
  }
  if (amount >= 1000) {
    return `${currency} ${(amount / 1000).toFixed(1)}K`;
  }
  return formatMoney(amount, currency);
}

function TrendBadge({ changePct }: { changePct: number }) {
  const up = changePct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      }`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(changePct).toFixed(1)}%
    </span>
  );
}

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: typeof Banknote;
  iconColor: string;
}

function KpiCard({ title, value, subtitle, trend, icon: Icon, iconColor }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs text-gray-500">{title}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight text-gray-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
          {trend !== undefined && (
            <div className="mt-2">
              <TrendBadge changePct={trend} />
            </div>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function NewTenantSignupsChart({ data }: { data: Array<{ month: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const hasData = data.some((d) => d.count > 0);
  
  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center text-center">
        <div>
          <Building2 className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No new tenants in last 6 months</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-40 items-end gap-2 px-1 pt-4">
      {data.map((d) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full max-w-[32px] rounded-t bg-gradient-to-t from-[#B91C1C] to-[#F87171]"
            style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
            title={`${d.count} tenants`}
          />
          <span className="text-[10px] text-gray-400">{d.month}</span>
        </div>
      ))}
    </div>
  );
}

function RevenueByServiceDonut({
  data,
  totalRevenue,
  currency,
}: {
  data: Array<{ serviceKey: string; amount: number; percentage: number }>;
  totalRevenue: number;
  currency: string;
}) {
  if (totalRevenue === 0 || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Banknote className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-sm font-medium text-gray-900">No revenue data</h3>
        <p className="mt-1 text-sm text-gray-500">
          No revenue has been generated yet or all services have zero revenue.
        </p>
      </div>
    );
  }

  const size = 160;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#6366F1', '#0EA5E9', '#A855F7'];

  return (
    <div className="space-y-4">
      <div className="relative mx-auto h-[160px] w-[160px]">
        <svg width={size} height={size} className="-rotate-90">
          {data.slice(0, 7).map((item, idx) => {
            const pct = item.percentage;
            const len = (pct / 100) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={item.serviceKey}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="transparent"
                stroke={colors[idx % colors.length]}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-base font-semibold text-gray-900">
            {formatCompactMoney(totalRevenue, currency)}
          </p>
          <p className="text-[10px] text-gray-400">Total Revenue</p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {data.slice(0, 7).map((item, idx) => (
          <li key={item.serviceKey} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-gray-600">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: colors[idx % colors.length] }}
              />
              <span className="truncate">{SERVICE_LABELS[item.serviceKey] || item.serviceKey}</span>
            </span>
            <span className="font-medium text-gray-800">{item.percentage.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SuperAdminOverviewPage() {
  const [data, setData] = useState<SuperAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await fetchSuperAdminOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-sm text-gray-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm text-white hover:bg-[#991B1B]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const lastUpdated = new Date(data.generatedAt).toLocaleString('en-US', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Platform Overview
          </h1>
          <p className="mt-1 text-sm text-gray-500">Last updated: {lastUpdated}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards Row 1 - Revenue Metrics */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Revenue & Billing</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Platform Revenue"
            value={formatMoney(data.totalPlatformRevenue, data.currency)}
            icon={Banknote}
            iconColor="bg-blue-50 text-blue-600"
          />
          <KpiCard
            title="Revenue This Month"
            value={formatMoney(data.revenueThisMonth, data.currency)}
            trend={data.revenueChangePct}
            icon={Banknote}
            iconColor="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            title="B2B Revenue"
            value={formatMoney(data.b2bRevenue, data.currency)}
            subtitle={`${data.b2bPercentage}% of total`}
            icon={Building2}
            iconColor="bg-purple-50 text-purple-600"
          />
          <KpiCard
            title="Pending Payments"
            value={formatMoney(data.pendingPaymentAmount, data.currency)}
            subtitle={`${data.pendingPaymentOrders} orders`}
            icon={Clock}
            iconColor="bg-amber-50 text-amber-600"
          />
        </div>
      </div>

      {/* KPI Cards Row 2 - Tenant Metrics */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Tenants & Users</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Tenants"
            value={data.totalTenants}
            subtitle={`${data.tenantsByStatus.active} active`}
            icon={Building2}
            iconColor="bg-indigo-50 text-indigo-600"
          />
          <KpiCard
            title="Active Tenants (30d)"
            value={data.activeTenantsLast30Days}
            icon={Building2}
            iconColor="bg-green-50 text-green-600"
          />
          <KpiCard
            title="Tenant Admins"
            value={data.totalTenantAdmins}
            icon={UserCog}
            iconColor="bg-cyan-50 text-cyan-600"
          />
          <KpiCard
            title="Managed Users"
            value={data.managedUsers}
            subtitle={`End users managed by platform`}
            icon={Users}
            iconColor="bg-rose-50 text-rose-600"
          />
        </div>
      </div>

      {/* KPI Cards Row 3 - Infrastructure Metrics */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Infrastructure</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Active VMs"
            value={data.totalActiveVms}
            icon={Server}
            iconColor="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            title="Catalog VM Requests"
            value={data.totalCatalogVmRequests}
            icon={Database}
            iconColor="bg-orange-50 text-orange-600"
          />
          <KpiCard
            title="External/Elastic VMs"
            value={data.totalExternalVms}
            icon={Server}
            iconColor="bg-teal-50 text-teal-600"
          />
          <KpiCard
            title="VMs Expiring Soon"
            value={data.totalVmsExpiringSoon}
            subtitle="Next 14 days"
            icon={Clock}
            iconColor="bg-red-50 text-red-600"
          />
        </div>
      </div>

      {/* Charts & Visual Data */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* New Tenant Signups */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">New Tenant Signups</h2>
            <span className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500">
              Last 6 Months
            </span>
          </div>
          <NewTenantSignupsChart data={data.newTenantSignups} />
        </div>

        {/* B2B vs B2C Revenue Split */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">B2B vs B2C Revenue</h2>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">B2B</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {formatMoney(data.b2bRevenue, data.currency)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                {data.b2bPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">B2C</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {formatMoney(data.b2cRevenue, data.currency)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                {data.b2cPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                className="bg-[#B91C1C]"
                style={{ width: `${data.b2bPercentage}%` }}
                title={`B2B: ${data.b2bPercentage.toFixed(1)}%`}
              />
              <div
                className="bg-[#FCA5A5]"
                style={{ width: `${data.b2cPercentage}%` }}
                title={`B2C: ${data.b2cPercentage.toFixed(1)}%`}
              />
            </div>
          </div>
        </div>

        {/* Revenue by Service */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Revenue by Service</h2>
          <div className="mt-3">
            <RevenueByServiceDonut
              data={data.revenueByService}
              totalRevenue={data.totalPlatformRevenue}
              currency={data.currency}
            />
          </div>
        </div>
      </div>

      {/* Pending Requests Queue */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Pending Requests Queue</h2>
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          {data.pendingRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Tenant</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.pendingRequests.slice(0, 10).map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            req.type === 'webyne_vm'
                              ? 'bg-blue-50 text-blue-700'
                              : req.type === 'dedicated_server'
                                ? 'bg-purple-50 text-purple-700'
                                : 'bg-gray-50 text-gray-700'
                          }`}
                        >
                          {req.type === 'webyne_vm'
                            ? 'Webyne VM'
                            : req.type === 'dedicated_server'
                              ? 'Dedicated'
                              : 'VM Order'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{req.tenantName}</td>
                      <td className="px-4 py-3 text-gray-600">{req.status}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {req.amount ? formatMoney(req.amount, data.currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-medium text-gray-900">No pending requests</h3>
              <p className="mt-1 text-sm text-gray-500">
                All requests have been processed or no requests have been submitted yet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Top Tenants Tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Tenants by Revenue */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Top Tenants by Revenue</h2>
          </div>
          {data.topTenantsByRevenue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3 font-medium">Tenant</th>
                    <th className="px-5 py-3 font-medium">Revenue</th>
                    <th className="px-5 py-3 font-medium">VMs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.topTenantsByRevenue.slice(0, 10).map((tenant) => (
                    <tr key={tenant.tenantId} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{tenant.tenantName}</p>
                          <p className="text-xs text-gray-500">{tenant.tenantSlug}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        {formatMoney(tenant.revenue, data.currency)}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{tenant.vmCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-medium text-gray-900">No revenue data</h3>
              <p className="mt-1 text-sm text-gray-500">
                No tenant revenue found or no transactions have occurred yet.
              </p>
            </div>
          )}
        </div>

        {/* Top Tenants by Resources */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Top Tenants by Resources</h2>
          </div>
          {data.topTenantsByResources.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3 font-medium">Tenant</th>
                    <th className="px-5 py-3 font-medium">VMs</th>
                    <th className="px-5 py-3 font-medium">vCPU</th>
                    <th className="px-5 py-3 font-medium">RAM (GB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.topTenantsByResources.slice(0, 10).map((tenant) => (
                    <tr key={tenant.tenantId} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{tenant.tenantName}</p>
                          <p className="text-xs text-gray-500">{tenant.tenantSlug}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-900">{tenant.vmCount}</td>
                      <td className="px-5 py-3 text-gray-600">{tenant.totalVCpu}</td>
                      <td className="px-5 py-3 text-gray-600">{tenant.totalMemoryGb.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Server className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-medium text-gray-900">No resource data</h3>
              <p className="mt-1 text-sm text-gray-500">
                No tenant VMs found or no resources have been allocated yet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* VMs Expiring Soon */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">VMs Expiring Soon</h2>
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          {data.vmsExpiringSoon.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3 font-medium">VM Name</th>
                    <th className="px-4 py-3 font-medium">Tenant</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Expiry Date</th>
                    <th className="px-4 py-3 font-medium">Days Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.vmsExpiringSoon.slice(0, 15).map((vm) => (
                    <tr key={vm.vmId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{vm.vmName}</td>
                      <td className="px-4 py-3 text-gray-600">{vm.tenantName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {vm.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(vm.expiryDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            vm.daysUntilExpiry <= 3
                              ? 'bg-red-50 text-red-700'
                              : vm.daysUntilExpiry <= 7
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-50 text-gray-700'
                          }`}
                        >
                          {vm.daysUntilExpiry} {vm.daysUntilExpiry === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-medium text-gray-900">No VMs expiring soon</h3>
              <p className="mt-1 text-sm text-gray-500">
                No VMs are scheduled to expire in the next 14 days.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 text-xs text-gray-600 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span className="font-semibold text-gray-800">Revenue trend: </span>
          {data.revenueChangePct >= 0 ? 'Up' : 'Down'} {Math.abs(data.revenueChangePct).toFixed(1)}%
          this month vs previous month.
        </p>
        <p>
          <span className="font-semibold text-gray-800">Active tenants: </span>
          {data.activeTenantsLast30Days} tenants had activity in the last 30 days.
        </p>
        <p>
          <span className="font-semibold text-gray-800">Pending requests: </span>
          {data.pendingDedicatedServers} dedicated servers + {data.pendingPaymentOrders} orders awaiting action.
        </p>
        <p>
          <span className="font-semibold text-gray-800">Infrastructure: </span>
          {data.totalActiveVms} active VMs, {data.totalVmsExpiringSoon} expiring in 14 days.
        </p>
      </div>
    </div>
  );
}
