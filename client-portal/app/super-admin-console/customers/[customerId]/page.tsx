'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Trash2,
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
  fetchAdminAssignableCatalog,
  fetchAdminServicesForUser,
  type AdminAssignedService,
  type AdminServiceCatalogItem,
} from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { fetchCatalogVmRequests } from '@/lib/vmCatalogApi';
import {
  fetchDedicatedRequests,
} from '@/lib/dedicatedServerApi';
import { fetchAllVMsAdmin } from '@/lib/vmApi';
import {
  extractCloudLabLinksFromWalletTransactions,
  fetchCloudLabsForOwner,
  type CustomerCloudLabRequest,
} from '@/lib/customerCloudLabsApi';
import type { AdminWallet, AdminWalletTransaction } from '@/types/adminBilling';
import type { ICatalogVm } from '@/lib/vmCatalogApi';
import type { IDedicatedServer } from '@/lib/dedicatedServerApi';
import type { IVM } from '@/lib/vmApi';
import { CustomerProjectsPanel } from '@/components/super-admin-console/CustomerProjectsPanel';
import { DeleteOrganizationModal } from '@/components/super-admin-console/DeleteOrganizationModal';
import { CustomerVmTable } from '@/components/super-admin-console/customer/CustomerVmTable';
import { CustomerServicesTab } from '@/components/super-admin-console/customer/CustomerServicesTab';
import { CustomerUsageByServiceTab } from '@/components/super-admin-console/customer/CustomerUsageByServiceTab';
import type { CustomerUsageBundle } from '@/lib/customerServiceConsole';
import { getCustomerServiceManageHref } from '@/lib/customerServiceConsole';
import { useAuth } from '@/context/AuthContext';

type Tab = 'overview' | 'services' | 'projects' | 'vms' | 'billing' | 'usage' | 'team';

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

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const isSuperAdmin = authUser?.role === 'super_admin';
  const customerId = typeof params?.customerId === 'string' ? params.customerId : '';

  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      const [userRes, walletData, txData, servicesData, catalogData, catalogReqs, dedicatedReqs, allVms] =
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
          fetchAdminAssignableCatalog().catch(() => [] as AdminServiceCatalogItem[]),
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
      setCatalog(catalogData.filter((item) => !isServiceHiddenFromUi(item.serviceKey)));
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

  const usageTotal = useMemo(
    () =>
      catalogRequests.length +
      dedicatedRequests.length +
      azureLabs.length +
      awsLabs.length +
      gcpLabs.length,
    [catalogRequests, dedicatedRequests, azureLabs, awsLabs, gcpLabs]
  );

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

  const usageBundle: CustomerUsageBundle = useMemo(
    () => ({
      vms,
      catalogRequests,
      dedicatedRequests,
      azureLabs,
      awsLabs,
      gcpLabs,
    }),
    [vms, catalogRequests, dedicatedRequests, azureLabs, awsLabs, gcpLabs]
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: 'Services' },
    { id: 'projects', label: 'Projects' },
    { id: 'vms', label: `VMs (${vms.length})` },
    { id: 'billing', label: `Billing (${txTotal})` },
    { id: 'usage', label: `Usage (${usageTotal})` },
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
          <div className="flex flex-wrap items-center gap-3">
            {isSuperAdmin && profile.accountType === 'b2b' && profile.role === 'admin' ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete organization
              </button>
            ) : null}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">Wallet balance</p>
              <p className="mt-0.5 text-lg font-semibold text-gray-900">
                {wallet ? formatMoney(wallet.balance) : '—'}
              </p>
            </div>
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
        <div className="space-y-6">
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
                  <button
                    type="button"
                    onClick={() => setTab('services')}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Manage services
                  </button>
                  <Link
                    href={`/super-admin-console/vm-management/admin-wallets?userId=${profile.id}&email=${encodeURIComponent(profile.email)}`}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Manage wallet / credit
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTab('projects')}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Manage projects
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('vms')}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View VMs
                  </button>
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
                    <dt className="text-gray-500">VPS VMs</dt>
                    <dd className="font-semibold text-gray-900">{vms.length}</dd>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-2">
                    <dt className="text-gray-500">Usage items</dt>
                    <dd className="font-semibold text-gray-900">{usageTotal}</dd>
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
        </div>
      ) : null}

      {tab === 'services' ? (
        <CustomerServicesTab
          customerId={profile.id}
          email={profile.email}
          usage={usageBundle}
          onServicesChanged={load}
        />
      ) : null}

      {tab === 'projects' ? <CustomerProjectsPanel adminId={profile.id} /> : null}

      {tab === 'vms' ? (
        <CustomerVmTable
          vms={vms}
          manageHref={
            getCustomerServiceManageHref('vm-management', profile.id, profile.email) ?? undefined
          }
          emptyMessage="No VPS Hosting VMs for this customer yet. Catalog VM requests, cloud labs, and other usage are on the Usage tab."
        />
      ) : null}

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
        <CustomerUsageByServiceTab
          customerId={profile.id}
          email={profile.email}
          usage={usageBundle}
          services={services}
          catalog={catalog}
        />
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

      <DeleteOrganizationModal
        open={deleteOpen}
        user={{ id: profile.id, email: profile.email }}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          router.push('/super-admin-console/customers?filter=organization');
        }}
      />
    </div>
  );
}
