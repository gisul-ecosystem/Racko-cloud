'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Circle,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { ErrorState } from '../../../../../components/dashboard/ErrorState';
import {
  getRequestById,
  getRequestSpend,
  reinstateRequestUser,
  syncRequestSpend,
} from '../../../../../cloud_automation_aws/api/client';
import { AWS_ROUTES } from '../../../../../cloud_automation_aws/constants';
import { useProvisionStatus } from '../../../../../cloud_automation_aws/hooks/useProvisionStatus';

function StepIcon({ state }) {
  if (state === 'completed') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-600">
        <Check className="h-4 w-4" />
      </span>
    );
  }

  if (state === 'in_progress') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-[#B91C1C]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    );
  }

  if (state === 'failed') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600">
        <X className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400">
      <Circle className="h-3.5 w-3.5" />
    </span>
  );
}

export default function AwsRequestStatusPage() {
  const params = useParams();
  const requestId = String(params.id ?? '');
  const [request, setRequest] = useState(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState(null);
  const [spend, setSpend] = useState([]);
  const [spendLoading, setSpendLoading] = useState(false);
  const [spendSyncing, setSpendSyncing] = useState(false);
  const [reinstatingUserId, setReinstatingUserId] = useState(null);

  const {
    snapshot,
    loading: provisionLoading,
    error: provisionError,
    isComplete,
    isFailed,
    refresh,
    retry,
    starting,
  } = useProvisionStatus({ requestId, autoStart: true });

  useEffect(() => {
    if (!requestId) return;

    void getRequestById(requestId)
      .then(setRequest)
      .catch((err) => setRequestError(err?.message || 'Failed to load request.'))
      .finally(() => setRequestLoading(false));
  }, [requestId]);

  const loadSpend = async () => {
    if (!requestId || !isComplete) return;
    setSpendLoading(true);
    try {
      const records = await getRequestSpend(requestId);
      setSpend(records);
    } catch {
      setSpend([]);
    } finally {
      setSpendLoading(false);
    }
  };

  useEffect(() => {
    if (isComplete) {
      void loadSpend();
    }
  }, [requestId, isComplete]);

  const syncSpend = async () => {
    if (!requestId) return;
    setSpendSyncing(true);
    try {
      await syncRequestSpend(requestId);
      await loadSpend();
    } finally {
      setSpendSyncing(false);
    }
  };

  const reinstateUser = async (userId) => {
    if (!requestId) return;
    setReinstatingUserId(userId);
    try {
      await reinstateRequestUser(requestId, userId);
      await loadSpend();
      const updated = await getRequestById(requestId);
      setRequest(updated);
    } finally {
      setReinstatingUserId(null);
    }
  };

  const loading = requestLoading || (provisionLoading && !snapshot);
  const error = requestError || provisionError;

  return (
    <div className="mx-auto max-w-screen-lg space-y-6 p-6">
      <div>
        <Link
          href={AWS_ROUTES.dashboard}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to overview
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Request status</h1>
        <p className="mt-1 text-sm text-gray-500">
          Provisioning status for request {requestId}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
          Loading request…
        </div>
      )}

      {error && !loading && <ErrorState message={error} onRetry={() => void refresh()} />}

      {request && !loading && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{request.customerEmail}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {request.region} · {request.accountCount} user
                  {request.accountCount !== 1 ? 's' : ''} ·{' '}
                  {request.costingMode === 'per_user' ? 'Per-user accounts' : 'Shared account'}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  isComplete
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : isFailed
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                }`}
              >
                {snapshot?.status || request.status}
              </span>
            </div>

            {snapshot && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{snapshot.message}</span>
                  <span>{snapshot.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isFailed ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-[#B91C1C]'
                    }`}
                    style={{ width: `${snapshot.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
              {isFailed && (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void retry()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-60"
                >
                  {starting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Retry provisioning
                </button>
              )}
            </div>
          </div>

          {snapshot?.steps && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">Provisioning steps</h2>
              <ol className="space-y-3">
                {snapshot.steps.map((step) => (
                  <li key={step.key} className="flex items-center gap-3">
                    <StepIcon state={step.state} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{step.label}</p>
                      <p className="text-xs capitalize text-gray-400">{step.state.replace('_', ' ')}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {snapshot?.failureReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {snapshot.failureReason}
            </div>
          )}

          {snapshot?.awsAccountId && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
              <strong className="text-gray-900">AWS Account ID:</strong> {snapshot.awsAccountId}
              {snapshot.perUserAccess && (
                <span className="ml-3 text-gray-500">Per-user permission sets</span>
              )}
              {snapshot.credentialsSent && (
                <span className="ml-3 text-green-600">Access instructions sent</span>
              )}
            </div>
          )}

          {isComplete && request.identityUsers?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">Lab users</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 font-medium">Username</th>
                      <th className="px-3 py-2 font-medium">Activation email</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.identityUsers.map((user) => (
                      <tr key={user.userId || user.username} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-3 font-mono text-gray-900">{user.username}</td>
                        <td className="px-3 py-3 text-gray-700">{user.email || '—'}</td>
                        <td className="px-3 py-3">
                          {user.needsActivation ? (
                            <span className="text-xs text-[#B91C1C]">⚠️ Awaiting email activation</span>
                          ) : (
                            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                AWS sends activation emails to each user address above. Check your inbox (including spam),
                or use Forgot password on the Identity Center sign-in page to resend.
              </p>
            </div>
          )}

          {isComplete && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Per-user spend</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Cost data updates every 24 hours via AWS Cost Explorer.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={spendSyncing}
                  onClick={() => void syncSpend()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  {spendSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sync spend now
                </button>
              </div>

              {spendLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
                  Loading spend data…
                </div>
              ) : spend.length === 0 ? (
                <p className="text-sm text-gray-500">No spend data yet. Try syncing from Cost Explorer.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Username</th>
                        <th className="px-3 py-2 font-medium">Today&apos;s spend</th>
                        <th className="px-3 py-2 font-medium">Budget</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Top service</th>
                        <th className="px-3 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spend.map((user) => (
                        <tr key={user.username} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-3 font-medium text-gray-900">{user.username}</td>
                          <td className="px-3 py-3 text-gray-700">${user.spendUsd.toFixed(4)}</td>
                          <td className="px-3 py-3 text-gray-700">
                            {request.perUserBudgetUsd != null
                              ? `$${request.perUserBudgetUsd}`
                              : '—'}
                          </td>
                          <td className="px-3 py-3">
                            {user.budgetExceeded || user.suspended ? (
                              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                                Suspended
                              </span>
                            ) : (
                              <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {user.services?.[0]?.serviceName || '—'}
                          </td>
                          <td className="px-3 py-3">
                            {user.suspended && (
                              <button
                                type="button"
                                disabled={reinstatingUserId === user.userId}
                                onClick={() => void reinstateUser(user.userId)}
                                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                              >
                                {reinstatingUserId === user.userId ? 'Reinstating…' : 'Reinstate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
