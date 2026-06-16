'use client';

import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { AZURE_ROUTES } from '../../constants';
import { useProvisionStatus } from '../../hooks/useProvisionStatus';
import type { OrchestrationEvent, ProvisionSnapshot, ProvisionStepState } from '../../types/provisioning';
import { getCompletedStepCount } from '../../utils/provisionSnapshot';
import { formatDateTime, getCustomerEmail } from '../../utils/formatters';
import { RequestStatusBadge } from '../RequestStatusBadge';

interface RequestStatusViewProps {
  requestId: number;
  initialSnapshot?: ProvisionSnapshot | null;
  initialError?: string | null;
  backHref?: string;
  backLabel?: string;
}

function StepIcon({ status }: { status: ProvisionStepState['status'] }) {
  if (status === 'complete') {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />;
  }
  if (status === 'active') {
    return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#B91C1C]" />;
  }
  if (status === 'failed') {
    return <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />;
  }
  return <Circle className="h-5 w-5 shrink-0 text-gray-300" />;
}

function EventIcon({ level }: { level: OrchestrationEvent['level'] }) {
  if (level === 'success') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
  if (level === 'error') return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
  return <Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />;
}

export function RequestStatusView({
  requestId,
  initialSnapshot = null,
  initialError = null,
  backHref = AZURE_ROUTES.dashboard,
  backLabel = 'Back to overview',
}: RequestStatusViewProps) {
  const { snapshot, steps, summary, events, loading, error, isComplete, refresh } =
    useProvisionStatus({
      requestId,
      initialSnapshot,
      initialError,
    });

  const completedCount = getCompletedStepCount(steps);
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const request = snapshot?.request ?? null;
  const failedStep = steps.find((step) => step.status === 'failed');

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return (
      <div className="mx-auto max-w-screen-lg">
        <ErrorState message="Invalid request ID." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-lg space-y-6">
      <div>
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Live provisioning — Request #{requestId}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Backend-driven Azure access provisioning with live orchestration updates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && !snapshot && !loading && (
        <ErrorState message={error} onRetry={() => void refresh(true)} />
      )}

      {snapshot && (
        <>
          {isComplete && (
            <div className="overflow-hidden rounded-xl border border-green-200 bg-green-50 shadow-sm">
              <div className="flex items-start gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-green-900">Provisioning complete</h2>
                  <p className="mt-1 text-sm text-green-800">
                    All provisioning steps finished successfully. Access credentials have been
                    queued or sent to{' '}
                    <span className="font-medium">{request ? getCustomerEmail(request) : 'the customer'}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Provisioning progress</h2>
                <p className="mt-1 text-xs text-gray-400">
                  {completedCount} of {steps.length} steps complete
                </p>
              </div>
              {request && <RequestStatusBadge status={request.status ?? 'Provisioning'} />}
            </div>

            <div className="mb-6 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isComplete ? 'bg-green-600' : 'bg-[#B91C1C]'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.key} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} />
                    {index < steps.length - 1 && (
                      <div
                        className={`mt-1 h-8 w-0.5 ${
                          step.status === 'complete' ? 'bg-green-200' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={`text-sm font-medium ${
                        step.status === 'complete'
                          ? 'text-gray-900'
                          : step.status === 'active'
                            ? 'text-[#B91C1C]'
                            : step.status === 'failed'
                              ? 'text-red-700'
                              : 'text-gray-500'
                      }`}
                    >
                      {step.label}
                    </p>
                    {step.error && (
                      <p className="mt-1 text-xs text-red-600">{step.error}</p>
                    )}
                    {step.status === 'active' && !step.error && (
                      <p className="mt-1 text-xs text-gray-400">In progress…</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Orchestration timeline</h2>
                  <p className="mt-1 text-xs text-gray-400">
                    Recent backend provisioning events
                  </p>
                </div>
                <div className="max-h-96 overflow-y-auto px-6 py-4">
                  {events.length === 0 ? (
                    <p className="text-sm text-gray-400">Waiting for orchestration events…</p>
                  ) : (
                    <ul className="space-y-4">
                      {events.map((event) => (
                        <li key={event.id} className="flex gap-3">
                          <EventIcon level={event.level} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800">{event.message}</p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {formatDateTime(event.timestamp)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {failedStep && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        {failedStep.label} failed
                      </p>
                      <p className="mt-1 text-sm text-red-700">{failedStep.error}</p>
                      <button
                        type="button"
                        onClick={() => void refresh(true)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry from last successful step
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6">
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Live summary</h2>
                  <p className="mt-1 text-xs text-gray-400">Values from backend snapshot</p>
                </div>
                <dl className="divide-y divide-gray-50 px-6">
                  {[
                    { label: 'Request ID', value: `#${requestId}` },
                    {
                      label: 'Customer',
                      value: request ? getCustomerEmail(request) : '—',
                    },
                    {
                      label: 'Resource group',
                      value: summary?.resourceGroup ?? 'Pending',
                    },
                    {
                      label: 'Users created',
                      value: String(summary?.usersCreated ?? 0),
                    },
                    {
                      label: 'Roles assigned',
                      value: String(summary?.rolesAssigned ?? 0),
                    },
                    {
                      label: 'Access link status',
                      value: summary?.accessLinkStatus ?? 'pending',
                      icon: <Send className="h-3.5 w-3.5 text-gray-400" />,
                    },
                    {
                      label: 'Last refresh',
                      value: formatDateTime(summary?.lastRefresh),
                      icon: <Clock className="h-3.5 w-3.5 text-gray-400" />,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-4 py-3.5">
                      <dt className="text-sm text-gray-500">{row.label}</dt>
                      <dd className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                        {'icon' in row && row.icon}
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          )}
        </>
      )}

      {loading && !snapshot && (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-16 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
        </div>
      )}
    </div>
  );
}
