'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { ApiError, apiRequest } from '@/lib/apiClient';
import {
  getAdminWalletByUserId,
  getAdminWalletTransactionsByUserId,
} from '@/lib/adminBillingApi';
import {
  fetchAdminServicesForUser,
  type AdminAssignedService,
  type AdminServiceCatalogItem,
} from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { fetchCatalogVmRequests, formatCatalogVmStatus } from '@/lib/vmCatalogApi';
import {
  fetchDedicatedRequests,
  formatDedicatedStatus,
} from '@/lib/dedicatedServerApi';
import { fetchAllVMsAdmin } from '@/lib/vmApi';
import {
  extractCloudLabLinksFromWalletTransactions,
  fetchCloudLabsForOwner,
  type CustomerCloudLabRequest,
} from '@/lib/customerCloudLabsApi';
import { AZURE_ROUTES } from '@/cloud_automation/constants';
import { AWS_ROUTES } from '@/cloud_automation_aws/constants';
import type { AdminWallet, AdminWalletTransaction } from '@/types/adminBilling';
import type { ICatalogVm } from '@/lib/vmCatalogApi';
import type { IDedicatedServer } from '@/lib/dedicatedServerApi';
import type { IVM } from '@/lib/vmApi';
import { CustomerProjectsPanel } from '@/components/super-admin-console/CustomerProjectsPanel';

type Tab = 'overview' | 'services' | 'projects' | 'billing' | 'usage' | 'team';

interface CustomerProfile {
  id: string;
  email: string;
  role: string;
  accountType?: 'legacy' | 'b2c' | 'b2b';
  onboardingStatus?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  vm_creation: 'VM Creation',
  dedicated_server_purchase: 'Dedicated Server',
  catalog_vm_purchase: 'Catalog VM',
  manual_credit: 'Manual Credit',
  razorpay_topup: 'Razorpay Top-up',
  refund: 'Refund',
  azure_lab_charge: 'Azure Lab',
  aws_lab_charge: 'AWS Lab',
  azure_lab_request: 'Azure Lab',
  aws_lab_request: 'AWS Lab',
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
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

function accountLabel(accountType?: string): string {
  return accountType === 'b2b' ? 'Organization' : 'Individual';
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
            <th className="px-4 py-3 text-right">Charged</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
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
                    {lab.fromWalletOnly ? ' · from billing' : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-gray-700">{lab.region || '—'}</td>
                <td className="px-4 py-3 capitalize text-gray-700">
                  {(lab.costingMode || '—').replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-gray-700">{lab.accountCount ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-gray-700">{lab.status}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {lab.chargedInr != null ? formatMoney(lab.chargedInr) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">{formatDate(lab.createdAt || undefined)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = typeof params?.customerId === 'string' ? params.customerId : '';

  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [transactions, setTransactions] = useState<AdminWalletTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [services, setServices] = useState<AdminAssignedService[]>([]);
  const [catalog, setCatalog] = useState<AdminServiceCatalogItem[]>([]);
  const [catalogRequests, setCatalogRequests] = useState<ICatalogVm[]>([]);
  const [dedicatedRequests, setDedicatedRequests] = useState<IDedicatedServer[]>([]);
  const [vms, setVms] = useState<IVM[]>([]);
  const [azureLabs, setAzureLabs] = useState<CustomerCloudLabRequest[]>([]);
  const [awsLabs, setAwsLabs] = useState<CustomerCloudLabRequest[]>([]);
  const [gcpLabs, setGcpLabs] = useState<CustomerCloudLabRequest[]>([]);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, walletData, txData, servicesData, catalogReqs, dedicatedReqs, allVms] =
        await Promise.all([
          apiRequest<{ success: boolean; data: { user?: CustomerProfile } | CustomerProfile }>(
            `/api/v1/users/${customerId}`
          ),
          getAdminWalletByUserId(customerId).catch(() => null),
          getAdminWalletTransactionsByUserId(customerId, 1, 100).catch(() => ({
            transactions: [],
            total: 0,
            page: 1,
            limit: 100,
          })),
          fetchAdminServicesForUser(customerId).catch(() => ({
            services: [] as AdminAssignedService[],
            catalog: [] as AdminServiceCatalogItem[],
          })),
          fetchCatalogVmRequests({ adminId: customerId, status: 'all' }).catch(() => []),
          fetchDedicatedRequests({ adminId: customerId, status: 'all' }).catch(() => []),
          fetchAllVMsAdmin().catch(() => [] as IVM[]),
        ]);

      const { links: walletLinks, unlinked: unlinkedWalletLabs } =
        extractCloudLabLinksFromWalletTransactions(txData.transactions);
      const cloudLabs = await fetchCloudLabsForOwner(customerId, {
        walletLinks,
        unlinkedWalletLabs,
      }).catch(() => ({
        azure: [] as CustomerCloudLabRequest[],
        aws: [] as CustomerCloudLabRequest[],
        gcp: [] as CustomerCloudLabRequest[],
      }));

      const raw = userRes.data;
      const user =
        raw && typeof raw === 'object' && 'user' in raw
          ? (raw.user as CustomerProfile)
          : (raw as CustomerProfile);

      setProfile(user);
      setWallet(walletData);
      setTransactions(txData.transactions);
      setTxTotal(txData.total);
      setServices(servicesData.services.filter((s) => !isServiceHiddenFromUi(s.serviceKey)));
      setCatalog(servicesData.catalog.filter((item) => !isServiceHiddenFromUi(item.serviceKey)));
      setCatalogRequests(catalogReqs);
      setDedicatedRequests(dedicatedReqs);
      setVms(allVms.filter((vm) => vm.adminId === customerId));
      setAzureLabs(cloudLabs.azure);
      setAwsLabs(cloudLabs.aws);
      setGcpLabs(cloudLabs.gcp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customer details.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const serviceRows = useMemo(() => {
    const assigned = new Map(services.map((s) => [s.serviceKey, s]));
    if (catalog.length === 0) {
      return services.map((s) => ({
        key: s.serviceKey,
        label: s.label || s.serviceKey,
        status: s.status,
      }));
    }
    return catalog.map((item) => {
      const found = assigned.get(item.serviceKey);
      return {
        key: item.serviceKey,
        label: item.label,
        status: found?.status ?? ('none' as const),
      };
    });
  }, [catalog, services]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: 'Services' },
    ...(profile?.accountType === 'b2b' || profile?.role === 'admin'
      ? [{ id: 'projects' as const, label: 'Projects' }]
      : []),
    { id: 'billing', label: `Billing (${txTotal})` },
    {
      id: 'usage',
      label: `Usage (${
        catalogRequests.length +
        dedicatedRequests.length +
        vms.length +
        azureLabs.length +
        awsLabs.length +
        gcpLabs.length
      })`,
    },
    { id: 'team', label: 'Team' },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-screen-xl space-y-4 p-6 lg:p-8">
        <Link
          href="/super-admin-console/customers"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Customer Directory
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Customer not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console/customers"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Customer Directory
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{profile.email}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  profile.accountType === 'b2b'
                    ? 'bg-violet-50 text-violet-700'
                    : 'bg-sky-50 text-sky-700'
                }`}
              >
                {accountLabel(profile.accountType)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  profile.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {profile.isActive ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3" /> Inactive
                  </>
                )}
              </span>
              {profile.onboardingStatus && profile.onboardingStatus !== 'active' ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold capitalize text-amber-700">
                  {profile.onboardingStatus.replace(/_/g, ' ')}
                </span>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-500">Wallet balance</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-900">
              {wallet ? formatMoney(wallet.balance) : '—'}
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
            <h2 className="text-sm font-semibold text-gray-900">Account details</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Email verified</dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  {profile.isEmailVerified ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Role</dt>
                <dd className="mt-0.5 font-medium capitalize text-gray-900">{profile.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Joined</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{formatDate(profile.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Last login</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{formatDate(profile.lastLoginAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Customer ID</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-700">{profile.id}</dd>
              </div>
            </dl>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/super-admin-console/admin-users/${profile.id}/services?email=${encodeURIComponent(profile.email)}`}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Manage services
                </Link>
                <Link
                  href={`/super-admin-console/vm-management/admin-wallets?userId=${profile.id}&email=${encodeURIComponent(profile.email)}`}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Manage wallet / credit
                </Link>
                {(profile.accountType === 'b2b' || profile.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => setTab('projects')}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Manage projects
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Snapshot</h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Active services</dt>
                  <dd className="font-semibold text-gray-900">
                    {serviceRows.filter((s) => s.status === 'active').length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Catalog VM requests</dt>
                  <dd className="font-semibold text-gray-900">{catalogRequests.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Dedicated requests</dt>
                  <dd className="font-semibold text-gray-900">{dedicatedRequests.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Managed VMs</dt>
                  <dd className="font-semibold text-gray-900">{vms.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Azure labs</dt>
                  <dd className="font-semibold text-gray-900">{azureLabs.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">AWS labs</dt>
                  <dd className="font-semibold text-gray-900">{awsLabs.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GCP labs</dt>
                  <dd className="font-semibold text-gray-900">{gcpLabs.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'services' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Services in use</h2>
            <Link
              href={`/super-admin-console/admin-users/${profile.id}/services?email=${encodeURIComponent(profile.email)}`}
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Edit entitlements →
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
              {serviceRows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-5 py-8 text-center text-gray-500">
                    No service data available.
                  </td>
                </tr>
              ) : (
                serviceRows.map((row) => (
                  <tr key={row.key} className="border-b border-gray-50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{row.label}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          row.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : row.status === 'suspended'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {row.status === 'active'
                          ? 'Active'
                          : row.status === 'suspended'
                            ? 'Suspended'
                            : 'Not assigned'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'projects' ? <CustomerProjectsPanel adminId={profile.id} /> : null}

      {tab === 'billing' ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Billing history</h2>
            </div>
            <Link
              href={`/super-admin-console/vm-management/admin-wallets?userId=${profile.id}&email=${encodeURIComponent(profile.email)}`}
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Open wallet page →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                    No billing transactions yet.
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
                    <td className="px-4 py-3 text-gray-700">
                      {REASON_LABELS[tx.reason] || tx.reason}
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

      {tab === 'usage' ? (
        <div className="space-y-6">
          <CloudLabRequestsTable
            title="Azure labs"
            rows={azureLabs}
            manageHref={AZURE_ROUTES.orgAdmin}
            emptyLabel="No Azure lab requests for this customer."
          />
          <CloudLabRequestsTable
            title="AWS labs"
            rows={awsLabs}
            manageHref={AWS_ROUTES.orgAdmin}
            emptyLabel="No AWS lab requests for this customer."
          />
          <CloudLabRequestsTable
            title="GCP labs"
            rows={gcpLabs}
            manageHref="/console/gcp"
            emptyLabel="No GCP lab requests yet (GCP automation is not provisioned)."
          />

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Catalog VM requests ({catalogRequests.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                </tr>
              </thead>
              <tbody>
                {catalogRequests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                      No catalog VM requests.
                    </td>
                  </tr>
                ) : (
                  catalogRequests.map((req) => (
                    <tr key={req._id} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{req.planName}</td>
                      <td className="px-4 py-3 capitalize text-gray-700">{req.billing}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatCatalogVmStatus(req.status)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(req.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Dedicated server requests ({dedicatedRequests.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                </tr>
              </thead>
              <tbody>
                {dedicatedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-gray-500">
                      No dedicated server requests.
                    </td>
                  </tr>
                ) : (
                  dedicatedRequests.map((req) => (
                    <tr key={req._id} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {req.planName || req.planId || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatDedicatedStatus(req.status)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(req.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Managed VMs ({vms.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {vms.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                      No managed VMs.
                    </td>
                  </tr>
                ) : (
                  vms.map((vm) => (
                    <tr key={vm._id} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{vm.name}</td>
                      <td className="px-4 py-3 text-gray-700">{vm.templateName}</td>
                      <td className="px-4 py-3 capitalize text-gray-700">{vm.status}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(vm.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {tab === 'team' ? (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Users className="h-6 w-6 text-gray-400" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Team / staff users</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Staff users created under this customer will appear here. This section will be wired
            once customer-level staff management is added.
          </p>
        </section>
      ) : null}
    </div>
  );
}
