'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Globe,
  Loader2,
  Users,
  Wallet,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchSuperAdminOrders,
  fetchTenant,
  fetchTenantAdmins,
  fetchTenantServices,
  fetchTenantVms,
  fetchTenantWalletBalance,
  fetchTenantWalletTransactions,
} from '@/lib/tenantApi';
import type {
  SuperAdminOrder,
  SuperAdminTenantVm,
  SuperAdminWalletTransaction,
  Tenant,
  TenantAdmin,
  TenantServiceConfig,
  TenantWalletBalance,
} from '@/lib/tenantTypes';
import {
  fetchServiceCatalog,
  type ServiceCatalogItem,
} from '@/lib/serviceCatalogApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import {
  fetchCloudLabsForOwner,
  tenantCloudOwnerId,
  type CustomerCloudLabRequest,
} from '@/lib/customerCloudLabsApi';
import { AZURE_ROUTES } from '@/cloud_automation/constants';
import { AWS_ROUTES } from '@/cloud_automation_aws/constants';
import { TenantStatusBadge } from '@/components/super-admin-console/white-labelling/TenantStatusBadge';
import { OrderStatusBadge } from '@/components/tenant/OrderStatusBadge';
import { TenantProjectsPanel } from '@/components/super-admin-console/TenantProjectsPanel';

type Tab = 'overview' | 'services' | 'billing' | 'orders' | 'vms' | 'cloud' | 'team' | 'projects';

function formatMoney(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CloudLabRequestsTable({
  title,
  rows,
  manageHref,
  emptyLabel,
}: {
  title: string;
  rows: CustomerCloudLabRequest[];
  manageHref: string;
  emptyLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {title} ({rows.length})
        </h2>
        <Link href={manageHref} className="text-xs font-medium text-[#B91C1C] hover:underline">
          Open org admin →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-5 py-3">Lab / customer</th>
            <th className="px-4 py-3">Region</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3">Users</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((lab) => (
              <tr key={`${lab.provider}-${lab.id}`} className="border-b border-gray-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{lab.customerEmail}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                    {lab.requestName || `#${lab.id}`}
                  </p>
                </td>
                <td className="px-4 py-3 text-gray-700">{lab.region || '—'}</td>
                <td className="px-4 py-3 capitalize text-gray-700">
                  {(lab.costingMode || '—').replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-gray-700">{lab.accountCount ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-gray-700">{lab.status}</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(lab.createdAt || undefined)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export default function CustomerTenantDetailPage() {
  const params = useParams();
  const tenantId = typeof params?.tenantId === 'string' ? params.tenantId : '';

  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [services, setServices] = useState<TenantServiceConfig[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [wallet, setWallet] = useState<TenantWalletBalance | null>(null);
  const [transactions, setTransactions] = useState<SuperAdminWalletTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [orders, setOrders] = useState<SuperAdminOrder[]>([]);
  const [vms, setVms] = useState<SuperAdminTenantVm[]>([]);
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [azureLabs, setAzureLabs] = useState<CustomerCloudLabRequest[]>([]);
  const [awsLabs, setAwsLabs] = useState<CustomerCloudLabRequest[]>([]);
  const [gcpLabs, setGcpLabs] = useState<CustomerCloudLabRequest[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [
        tenantData,
        servicesData,
        walletData,
        txData,
        allOrders,
        vmsData,
        adminsData,
        cloudLabs,
        catalogData,
      ] = await Promise.all([
        fetchTenant(tenantId),
        fetchTenantServices(tenantId).catch(() => [] as TenantServiceConfig[]),
        fetchTenantWalletBalance(tenantId).catch(() => null),
        fetchTenantWalletTransactions(tenantId, 1, 50).catch(() => ({
          transactions: [] as SuperAdminWalletTransaction[],
          total: 0,
          page: 1,
          limit: 50,
        })),
        fetchSuperAdminOrders().catch(() => [] as SuperAdminOrder[]),
        fetchTenantVms(tenantId).catch(() => ({ vms: [] as SuperAdminTenantVm[], total: 0 })),
        fetchTenantAdmins(tenantId).catch(() => [] as TenantAdmin[]),
        fetchCloudLabsForOwner(tenantCloudOwnerId(tenantId)).catch(() => ({
          azure: [] as CustomerCloudLabRequest[],
          aws: [] as CustomerCloudLabRequest[],
          gcp: [] as CustomerCloudLabRequest[],
        })),
        fetchServiceCatalog({ kind: 'product', scope: 'tenant' }).catch(
          () => [] as ServiceCatalogItem[]
        ),
      ]);

      setTenant(tenantData);
      setServices(servicesData);
      setServiceCatalog(catalogData.filter((s) => !isServiceHiddenFromUi(s.key)));
      setWallet(walletData);
      setTransactions(txData.transactions);
      setTxTotal(txData.total);
      setOrders(allOrders.filter((o) => o.tenantId === tenantId));
      setVms(vmsData.vms);
      setAdmins(adminsData);
      setAzureLabs(cloudLabs.azure);
      setAwsLabs(cloudLabs.aws);
      setGcpLabs(cloudLabs.gcp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tenant details.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const serviceRows = useMemo(() => {
    // Match white-labelling: assignment configs are source of truth (not tenant.enabledServices).
    const assigned = new Map<string, TenantServiceConfig>(
      services.map((s) => [s.serviceKey, s])
    );
    return serviceCatalog.map((catalog) => {
      const cfg = assigned.get(catalog.key);
      return {
        key: catalog.key,
        label: catalog.label,
        description: catalog.description,
        status: !cfg
          ? ('none' as const)
          : cfg.status === 'suspended'
            ? ('suspended' as const)
            : ('active' as const),
      };
    });
  }, [services, serviceCatalog]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: 'Services' },
    { id: 'projects', label: 'Projects' },
    { id: 'billing', label: `Billing (${txTotal})` },
    { id: 'orders', label: `Orders (${orders.length})` },
    { id: 'vms', label: `VMs (${vms.length})` },
    {
      id: 'cloud',
      label: `Cloud labs (${azureLabs.length + awsLabs.length + gcpLabs.length})`,
    },
    { id: 'team', label: `Admins (${admins.length})` },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="mx-auto max-w-screen-xl space-y-4 p-6 lg:p-8">
        <Link
          href="/super-admin-console/customers?filter=tenant"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Customer Directory
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Tenant not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console/customers?filter=tenant"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Customer Directory
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <Globe className="h-3 w-3" />
                Tenant
              </span>
              <TenantStatusBadge status={tenant.status} />
              <span className="font-mono text-xs text-gray-400">{tenant.slug}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{tenant.domain}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-500">Wallet balance</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-900">
              {wallet ? formatMoney(wallet.balance, wallet.currency || 'INR') : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-900">Tenant details</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Domain</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{tenant.domain}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Slug</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-700">{tenant.slug}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Support email</dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  {tenant.branding?.supportEmail || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">IP access</dt>
                <dd className="mt-0.5 font-medium capitalize text-gray-900">
                  {tenant.ipAccessMode?.replace(/_/g, ' ') || 'all'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{formatDate(tenant.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Updated</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{formatDate(tenant.updatedAt)}</dd>
              </div>
            </dl>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/super-admin-console/white-labelling/tenants/${tenant.id}`}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open full white-labelling config
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Snapshot</h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Allowed services</dt>
                  <dd className="font-semibold text-gray-900">
                    {services.filter((s) => s.status === 'active').length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Orders</dt>
                  <dd className="font-semibold text-gray-900">{orders.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">VMs</dt>
                  <dd className="font-semibold text-gray-900">{vms.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Tenant admins</dt>
                  <dd className="font-semibold text-gray-900">{admins.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Azure labs</dt>
                  <dd className="font-semibold text-gray-900">{azureLabs.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">AWS labs</dt>
                  <dd className="font-semibold text-gray-900">{awsLabs.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'services' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Services</h2>
            <Link
              href={`/super-admin-console/white-labelling/tenants/${tenant.id}`}
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Manage in White Labelling →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {serviceRows.map((row) => (
                <tr key={row.key} className="border-b border-gray-50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{row.label}</p>
                    <p className="mt-0.5 font-mono text-xs text-gray-400">{row.key}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.description}</p>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : row.status === 'suspended'
                            ? 'bg-orange-50 text-orange-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.status === 'active'
                        ? 'Allowed'
                        : row.status === 'suspended'
                          ? 'Suspended'
                          : 'Not assigned'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'projects' ? <TenantProjectsPanel tenantId={tenant.id} /> : null}

      {tab === 'billing' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Wallet & billing logs</h2>
            </div>
            <Link
              href={`/super-admin-console/white-labelling/tenants/${tenant.id}`}
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Manage wallet →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                    No wallet transactions yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 text-gray-700">{formatDate(tx.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          tx.type === 'credit'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {tx.type === 'credit' ? (
                          <ArrowDownLeft className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700">
                      {(tx.source || 'wallet').replace(/_/g, ' ')}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        tx.type === 'credit' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {tx.type === 'credit' ? '+' : '-'}
                      {formatMoney(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatMoney(tx.balanceAfter)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'orders' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Orders</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Template</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                    No orders yet.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{order.templateName}</td>
                    <td className="px-4 py-3 text-gray-700">{order.count}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(order.calculatedAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(order.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'vms' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Tenant VMs</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned to</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {vms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                    No VMs for this tenant.
                  </td>
                </tr>
              ) : (
                vms.map((vm) => (
                  <tr key={vm.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{vm.name}</td>
                    <td className="px-4 py-3 text-gray-700">{vm.templateName}</td>
                    <td className="px-4 py-3 capitalize text-gray-700">{vm.status}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {vm.assignment?.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(vm.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'cloud' ? (
        <div className="space-y-6">
          <CloudLabRequestsTable
            title="Azure labs"
            rows={azureLabs}
            manageHref={AZURE_ROUTES.orgAdmin}
            emptyLabel="No Azure lab requests for this tenant."
          />
          <CloudLabRequestsTable
            title="AWS labs"
            rows={awsLabs}
            manageHref={AWS_ROUTES.orgAdmin}
            emptyLabel="No AWS lab requests for this tenant."
          />
          <CloudLabRequestsTable
            title="GCP labs"
            rows={gcpLabs}
            manageHref="/console/gcp"
            emptyLabel="No GCP lab requests yet (GCP automation is not provisioned)."
          />
        </div>
      ) : null}

      {tab === 'team' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Tenant admins</h2>
            </div>
            <Link
              href={`/super-admin-console/white-labelling/tenants/${tenant.id}`}
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Manage admins →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                    No tenant admins yet.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{admin.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          admin.isActive === false
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {admin.isActive === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {admin.isEmailVerified ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(admin.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
