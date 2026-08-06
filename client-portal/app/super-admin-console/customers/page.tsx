'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe,
  Loader2,
  UserRound,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/apiClient';
import { getAdminWalletByUserId } from '@/lib/adminBillingApi';
import {
  fetchOrganizationRequests,
  reviewOrganizationRequest,
  type OrganizationAccessRequest,
} from '@/lib/customerOnboardingApi';
import { fetchTenants } from '@/lib/tenantApi';
import type { Tenant } from '@/lib/tenantTypes';
import { TenantStatusBadge } from '@/components/super-admin-console/white-labelling/TenantStatusBadge';
import { useAuth } from '@/context/AuthContext';

type CustomerFilter = 'all' | 'individual' | 'organization' | 'tenant';

interface CustomerUser {
  id: string;
  email: string;
  role: string;
  accountType?: 'legacy' | 'b2c' | 'b2b';
  onboardingStatus?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  walletBalance: number | null;
  walletLoading: boolean;
}

/** Existing (legacy) accounts are treated as Individual customers. */
function isOrganization(accountType?: string): boolean {
  return accountType === 'b2b';
}

function isIndividual(accountType?: string): boolean {
  return !isOrganization(accountType);
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function accountBadge(accountType?: string): { label: string; className: string } {
  if (isOrganization(accountType)) {
    return { label: 'Organization', className: 'bg-violet-50 text-violet-700' };
  }
  return { label: 'Individual', className: 'bg-sky-50 text-sky-700' };
}

function parseFilter(raw: string | null): CustomerFilter {
  if (raw === 'individual' || raw === 'organization' || raw === 'tenant' || raw === 'all') {
    return raw;
  }
  return 'all';
}

function CustomerDirectoryContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSuperAdmin = user?.role === 'super_admin';

  const [filter, setFilter] = useState<CustomerFilter>(() => parseFilter(searchParams.get('filter')));
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [requests, setRequests] = useState<OrganizationAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<OrganizationAccessRequest | null>(null);

  useEffect(() => {
    setFilter(parseFilter(searchParams.get('filter')));
  }, [searchParams]);

  function changeFilter(next: CustomerFilter) {
    setFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    const qs = params.toString();
    router.replace(`/super-admin-console/customers${qs ? `?${qs}` : ''}`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, orgRequests, tenantsData] = await Promise.all([
        apiRequest<{
          success: boolean;
          data: { users: Omit<CustomerUser, 'walletBalance' | 'walletLoading'>[] };
        }>('/api/v1/users'),
        fetchOrganizationRequests().catch(() => [] as OrganizationAccessRequest[]),
        fetchTenants({ page: 1, limit: 200 }).catch(() => ({
          tenants: [] as Tenant[],
          total: 0,
          page: 1,
          limit: 200,
        })),
      ]);

      const relevant = usersRes.data.users.filter((u) => u.role === 'admin');

      setCustomers(
        relevant.map((u) => ({
          ...u,
          accountType: u.accountType ?? 'legacy',
          walletBalance: null,
          walletLoading: u.role === 'admin',
        }))
      );
      setRequests(orgRequests);
      setTenants(tenantsData.tenants);
      setLoading(false);

      const adminUsers = relevant.filter((u) => u.role === 'admin');
      const walletResults = await Promise.allSettled(
        adminUsers.map((u) => getAdminWalletByUserId(u.id))
      );
      const walletById = new Map<string, number | null>();
      adminUsers.forEach((u, i) => {
        walletById.set(
          u.id,
          walletResults[i]?.status === 'fulfilled' ? walletResults[i].value.balance : null
        );
      });

      setCustomers((prev) =>
        prev.map((c) =>
          c.role === 'admin'
            ? {
                ...c,
                walletBalance: walletById.has(c.id) ? walletById.get(c.id)! : null,
                walletLoading: false,
              }
            : { ...c, walletLoading: false }
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customers.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (filter === 'tenant') return false;
      if (filter === 'individual') return isIndividual(c.accountType);
      if (filter === 'organization') return isOrganization(c.accountType);
      return true;
    });
  }, [customers, filter]);

  const showOrgRequests = filter === 'all' || filter === 'organization';
  const showTenants = filter === 'all' || filter === 'tenant';
  const showCustomers = filter !== 'tenant';
  const openOrgRequests = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests]
  );
  const pendingOrgCount = openOrgRequests.length;
  const headerCount =
    filter === 'tenant'
      ? tenants.length
      : filter === 'all'
        ? customers.length + tenants.length
        : filteredCustomers.length;

  async function handleReview(
    req: OrganizationAccessRequest,
    status: 'approved' | 'rejected'
  ) {
    try {
      const updated = await reviewOrganizationRequest(req._id, {
        status,
        ndaStatus: status === 'approved' ? 'completed' : req.ndaStatus,
      });
      if (status === 'approved' || status === 'rejected') {
        setSelectedRequest(null);
      } else {
        setSelectedRequest((prev) => (prev?._id === updated._id ? updated : prev));
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update request.');
    }
  }

  const filters: Array<{ id: CustomerFilter; label: string; icon: typeof Users; count: number }> = [
    {
      id: 'all',
      label: 'All',
      icon: Users,
      count: customers.length + tenants.length,
    },
    {
      id: 'individual',
      label: 'Individual',
      icon: UserRound,
      count: customers.filter((c) => isIndividual(c.accountType)).length,
    },
    {
      id: 'organization',
      label: 'Organization',
      icon: Building2,
      count: customers.filter((c) => isOrganization(c.accountType)).length,
    },
    {
      id: 'tenant',
      label: 'Tenant',
      icon: Globe,
      count: tenants.length,
    },
  ];

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to console
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Customer Directory</h1>
          {!loading ? (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {headerCount}
            </span>
          ) : null}
          {pendingOrgCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              {pendingOrgCount} org request{pendingOrgCount === 1 ? '' : 's'} pending
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          View individual customers, organizations, white-label tenants, and organization access
          requests.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => changeFilter(id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === id
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px]">{count}</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showOrgRequests ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Organization access requests</h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">NDA</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : openOrgRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No pending organization requests.
                    </td>
                  </tr>
                ) : (
                  openOrgRequests.map((req) => {
                    const userInfo = typeof req.userId === 'string' ? null : req.userId;
                    return (
                      <tr
                        key={req._id}
                        className="cursor-pointer border-b border-gray-100 align-top transition hover:bg-gray-50"
                        onClick={() => setSelectedRequest(req)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{req.contactName}</p>
                          <p className="text-xs text-gray-500">
                            {userInfo?.email ?? 'Unknown email'}
                          </p>
                          <span className="mt-1 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                            Organization
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{req.companyName}</p>
                          <p className="text-xs text-gray-500">
                            {req.companyWebsite || req.useCase || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-700">
                          {req.status.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-700">
                          {req.ndaStatus.replace(/_/g, ' ')}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isSuperAdmin ? (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void handleReview(req, 'approved')}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReview(req, 'rejected')}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">View only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showTenants ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Tenants</h2>
            </div>
            <Link
              href="/super-admin-console/white-labelling/tenants"
              className="text-xs font-medium text-[#B91C1C] hover:underline"
            >
              Manage in White Labelling →
            </Link>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tenants…
            </div>
          ) : tenants.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
              No tenants yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <Link
                  key={tenant.id}
                  href={`/super-admin-console/customers/tenants/${tenant.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{tenant.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{tenant.domain}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Tenant
                        </span>
                        <span className="font-mono text-[10px] text-gray-400">{tenant.slug}</span>
                      </div>
                    </div>
                    <TenantStatusBadge status={tenant.status} />
                  </div>
                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">Services</dt>
                      <dd className="font-medium text-gray-700">
                        {tenant.enabledServices?.length ?? 0}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">Created</dt>
                      <dd className="text-gray-700">{formatDate(tenant.createdAt)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-gray-100 pt-3 text-xs font-medium text-[#B91C1C]">
                    View billing, services, and logs →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showCustomers ? (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Customers</h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading customers…
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Users className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">No customers in this filter</p>
            <p className="mt-1 text-xs text-gray-400">Try another filter or invite a new customer.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers.map((customer) => {
              const badge = accountBadge(customer.accountType);
              return (
                <Link
                  key={customer.id}
                  href={`/super-admin-console/customers/${customer.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {customer.email}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {customer.onboardingStatus && customer.onboardingStatus !== 'active' ? (
                          <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-amber-700">
                            {customer.onboardingStatus.replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        customer.isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {customer.isActive ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Inactive
                        </>
                      )}
                    </span>
                  </div>

                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">Email verified</dt>
                      <dd
                        className={
                          customer.isEmailVerified
                            ? 'font-medium text-green-600'
                            : 'font-medium text-orange-500'
                        }
                      >
                        {customer.isEmailVerified ? 'Yes' : 'No'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">Last login</dt>
                      <dd className="text-gray-700">{formatDate(customer.lastLoginAt)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">Joined</dt>
                      <dd className="text-gray-700">{formatDate(customer.createdAt)}</dd>
                    </div>

                    {customer.role === 'admin' ? (
                      <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2">
                        <dt className="flex items-center gap-1 text-gray-500">
                          <Wallet className="h-3 w-3" />
                          Wallet balance
                        </dt>
                        <dd className="font-semibold text-gray-900">
                          {customer.walletLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                          ) : customer.walletBalance !== null ? (
                            formatMoney(customer.walletBalance)
                          ) : (
                            '—'
                          )}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {customer.role === 'admin' ? (
                    <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs font-medium text-[#B91C1C]">
                      View billing, services, and usage →
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {selectedRequest ? (
        <OrganizationRequestDetailModal
          request={selectedRequest}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedRequest(null)}
          onReview={(status) => void handleReview(selectedRequest, status)}
        />
      ) : null}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{value?.trim() ? value : '—'}</dd>
    </div>
  );
}

function OrganizationRequestDetailModal({
  request,
  isSuperAdmin,
  onClose,
  onReview,
}: {
  request: OrganizationAccessRequest;
  isSuperAdmin: boolean;
  onClose: () => void;
  onReview: (status: 'approved' | 'rejected') => void;
}) {
  const userInfo = typeof request.userId === 'string' ? null : request.userId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-request-detail-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h3 id="org-request-detail-title" className="text-base font-semibold text-gray-900">
              Organization request details
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Submitted {formatDate(request.createdAt)} · Status{' '}
              <span className="capitalize">{request.status.replace(/_/g, ' ')}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Contact name" value={request.contactName} />
            <DetailField label="Email" value={userInfo?.email} />
            <DetailField label="Company name" value={request.companyName} />
            <DetailField label="Company website" value={request.companyWebsite} />
            <DetailField label="Phone" value={request.phone} />
            <DetailField label="Office number" value={request.officeNumber} />
            <DetailField label="Designation" value={request.designation} />
            <DetailField label="Company size" value={request.companySize} />
            <DetailField label="Tax / registration ID" value={request.taxId} />
            <div className="sm:col-span-2">
              <DetailField label="Registered address" value={request.registeredAddress} />
            </div>
            <div className="sm:col-span-2">
              <DetailField label="Use case" value={request.useCase} />
            </div>
            <div className="sm:col-span-2">
              <DetailField label="Expected usage" value={request.expectedUsage} />
            </div>
            <DetailField label="NDA status" value={request.ndaStatus.replace(/_/g, ' ')} />
            <DetailField label="Reviewer notes" value={request.reviewerNotes} />
          </dl>

          {isSuperAdmin ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => onReview('approved')}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReview('rejected')}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Reject
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function CustomerDirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
          Loading Customer Directory…
        </div>
      }
    >
      <CustomerDirectoryContent />
    </Suspense>
  );
}
