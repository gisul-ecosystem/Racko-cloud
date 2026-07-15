'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  approveCatalogVmRequest,
  attachCatalogVmRequest,
  catalogVmStatusNote,
  catalogVmStatusTone,
  fetchCatalogVmDetails,
  fetchCatalogVmRequests,
  formatCatalogVmStatus,
  rejectCatalogVmRequest,
  type ICatalogVm,
  type VmCatalogCategory,
  type VmCatalogStatus,
} from '@/lib/vmCatalogApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CategoryBadge({ category }: { category: VmCatalogCategory }) {
  const styles: Record<VmCatalogCategory, string> = {
    linux: 'bg-green-50 text-green-700 border-green-200',
    windows: 'bg-blue-50 text-blue-700 border-blue-200',
    gpu: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[category]}`}
    >
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: VmCatalogStatus }) {
  const tone = catalogVmStatusTone(status);
  const note = catalogVmStatusNote(status);
  const styles = {
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[tone];

  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
      >
        {formatCatalogVmStatus(status)}
      </span>
      {note ? <p className="text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

export default function WebyneVmRequestsByAdminPage() {
  const params = useParams();
  const adminId = typeof params?.adminId === 'string' ? params.adminId : '';

  const [requests, setRequests] = useState<ICatalogVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VmCatalogStatus | 'all'>('all');
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!adminId) return;
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await fetchCatalogVmRequests({
        adminId,
        status: statusFilter,
      });
      setRequests(data);
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof ApiError ? err.message : 'Failed to load requests.');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [adminId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while any request is fulfilling
  useEffect(() => {
    const hasFulfilling = requests.some((r) => r.status === 'fulfilling');
    if (!hasFulfilling) return;
    const id = setInterval(() => void load({ silent: true }), 4000);
    return () => clearInterval(id);
  }, [requests, load]);

  const adminEmail = requests[0]?.adminEmail ?? adminId;

  async function handleApprove(id: string) {
    setActionId(id);
    setSuccessMsg(null);
    try {
      await approveCatalogVmRequest(id);
      setSuccessMsg('Fulfillment started — fetching details from Webyne…');
      setStatusFilter('all');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Approve failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleFetchDetails(id: string) {
    setActionId(id);
    setSuccessMsg(null);
    try {
      await fetchCatalogVmDetails(id);
      setSuccessMsg('Fetching from Webyne /admin/server (no new purchase)…');
      setStatusFilter('all');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fetch details failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleAttach(id: string) {
    setActionId(id);
    setSuccessMsg(null);
    try {
      await attachCatalogVmRequest(id);
      setSuccessMsg('VM attached — now visible to the admin under My VM.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Attach failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectId || !rejectReason.trim()) return;
    setActionId(rejectId);
    setSuccessMsg(null);
    try {
      await rejectCatalogVmRequest(rejectId, rejectReason.trim());
      setRejectId(null);
      setRejectReason('');
      setSuccessMsg('Request rejected.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reject failed.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div>
        <Link
          href="/super-admin-console/webyne-vm-requests"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> All requesters
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Requests</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          From <span className="font-medium text-gray-700">{adminEmail}</span>
          {' · '}
          Approve to fulfill on Webyne, then Attach to release to admin.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['provisioning', 'Provisioning'],
            ['fulfilling', 'Fulfilling'],
            ['ready_to_attach', 'Ready to attach'],
            ['active', 'Active'],
            ['failed', 'Failed'],
            ['rejected', 'Rejected'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              statusFilter === value
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={5} cols={6} embedded />
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              No requests for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Plan
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Requested
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <Fragment key={req._id}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50/80">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-gray-900">{req.planName}</p>
                          <p className="text-xs text-gray-500">
                            {req.billing}
                            {req.quantity > 1 ? ` · ×${req.quantity}` : ''}
                            {' · '}
                            {req.template.label}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <CategoryBadge category={req.category} />
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-700">
                          {formatMoney(req.pricingSnapshot.total)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={req.status} />
                          {req.fulfillError ? (
                            <p className="mt-1 max-w-xs text-xs text-red-600">{req.fulfillError}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">
                          {formatDate(req.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            {(req.status === 'provisioning' ||
                              req.status === 'pending_approval') &&
                              !req.providerPurchased && (
                              <button
                                type="button"
                                disabled={actionId === req._id}
                                onClick={() => void handleApprove(req._id)}
                                className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a01717] disabled:opacity-60"
                              >
                                {actionId === req._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Approve
                              </button>
                            )}
                            {(req.status === 'failed' ||
                              req.status === 'ready_to_attach' ||
                              req.providerPurchased) &&
                              req.status !== 'fulfilling' &&
                              req.status !== 'active' &&
                              req.status !== 'rejected' && (
                              <button
                                type="button"
                                disabled={actionId === req._id}
                                onClick={() => void handleFetchDetails(req._id)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                                title="Scrape /admin/server only — does not buy again"
                              >
                                {actionId === req._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                Fetch details
                              </button>
                            )}
                            {req.status === 'failed' &&
                              !req.providerPurchased &&
                              !/checkout may have succeeded|SERVER_DETAILS/i.test(
                                req.fulfillError || ''
                              ) && (
                              <button
                                type="button"
                                disabled={actionId === req._id}
                                onClick={() => void handleApprove(req._id)}
                                className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a01717] disabled:opacity-60"
                              >
                                {actionId === req._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Approve
                              </button>
                            )}
                            {req.status === 'fulfilling' && (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Fetching…
                              </span>
                            )}
                            {req.status === 'ready_to_attach' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedId((prev) =>
                                      prev === req._id ? null : req._id
                                    )
                                  }
                                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  {expandedId === req._id ? 'Hide details' : 'View details'}
                                </button>
                                <button
                                  type="button"
                                  disabled={actionId === req._id}
                                  onClick={() => void handleAttach(req._id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a01717] disabled:opacity-60"
                                >
                                  {actionId === req._id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Link2 className="h-3.5 w-3.5" />
                                  )}
                                  Attach
                                </button>
                              </>
                            )}
                            {req.status !== 'active' &&
                              req.status !== 'rejected' &&
                              req.status !== 'fulfilling' && (
                                <button
                                  type="button"
                                  disabled={actionId === req._id}
                                  onClick={() => {
                                    setRejectId(req._id);
                                    setRejectReason('');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === req._id && req.status === 'ready_to_attach' && (
                        <tr className="border-b border-amber-100 bg-amber-50/40">
                          <td colSpan={6} className="px-5 py-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                              Fetched from Webyne (admin cannot see this until Attach)
                            </p>
                            <div className="grid gap-2 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <span className="text-xs text-gray-500">Hostname</span>
                                <p className="font-mono text-xs">{req.hostname || '—'}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500">IP</span>
                                <p className="font-mono text-xs">{req.ipAddress || '—'}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500">Username</span>
                                <p className="font-mono text-xs">{req.username || '—'}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500">Password</span>
                                <p className="font-mono text-xs">{req.password || '—'}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500">Protocol</span>
                                <p className="font-mono text-xs uppercase">{req.protocol || '—'}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500">Webyne ref</span>
                                <p className="font-mono text-xs">{req.externalRef || '—'}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
          <form
            onSubmit={(e) => void handleReject(e)}
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-gray-900">Reject request</h2>
            <p className="mt-1 text-sm text-gray-500">
              Provide a reason — the requesting admin will be notified and refunded if charged.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              required
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
              placeholder="Reason for rejection"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectId(null);
                  setRejectReason('');
                }}
                className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!rejectReason.trim() || actionId === rejectId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#a01717] disabled:opacity-60"
              >
                {actionId === rejectId && <Loader2 className="h-4 w-4 animate-spin" />}
                Reject
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
