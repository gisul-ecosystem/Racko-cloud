'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Cloud,
  DollarSign,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Users,
} from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { useGcpRoutes } from '@/lib/cloudPortalRoutes';
import { useCloudAccentColor } from '@/lib/cloudAccent';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { getRequest, type GcpRequest } from '../../api/client';
import { useGcpProvisionStatus } from '../../hooks/useProvisionStatus';
import { GcpRequestStatusBadge } from '../GcpRequestStatusBadge';
import { RACKO_BTN_PRIMARY, RACKO_BTN_SECONDARY } from '../cloudButtonStyles';
import {
  formatCurrency,
  formatDateTime,
  formatGcpRegion,
  formatRelativeTime,
  getAccountCount,
  getCreatedAt,
  getCustomerEmail,
  getEstimatedPrice,
  getProjectName,
} from '../../utils/formatters';

type StepVisualStatus = 'complete' | 'active' | 'failed' | 'pending';

interface GcpRequestStatusViewProps {
  requestId: string;
  backHref?: string;
  backLabel?: string;
}

function StepIcon({
  status,
  accent,
}: {
  status: StepVisualStatus;
  accent: string;
}) {
  if (status === 'complete') {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />;
  }
  if (status === 'active') {
    return <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color: accent }} />;
  }
  if (status === 'failed') {
    return <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />;
  }
  return <Circle className="h-5 w-5 shrink-0 text-gray-300" />;
}

function MetaChip({
  icon,
  label,
  value,
  hint,
  accent,
  soft,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: string;
  soft: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3"
      title={hint ?? value}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm"
        style={{ color: accent, backgroundColor: soft }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-900">{value}</p>
        {hint ? <p className="truncate text-[11px] text-gray-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex gap-4">
          <div className="h-14 w-14 rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 rounded bg-gray-200" />
            <div className="h-4 w-64 rounded bg-gray-100" />
          </div>
        </div>
      </div>
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
        <div className="h-2 rounded-full bg-gray-100" />
      </div>
    </div>
  );
}

function mapStepStatus(
  rawStatus: string,
  stepIndex: number,
  activeStepIndex: number,
  requestFailed: boolean
): StepVisualStatus {
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'complete') return 'complete';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  if (requestFailed && stepIndex === activeStepIndex) return 'failed';
  if (stepIndex === activeStepIndex && !requestFailed) return 'active';
  if (stepIndex < activeStepIndex) return 'complete';
  return 'pending';
}

export function GcpRequestStatusView({
  requestId,
  backHref,
  backLabel = 'Back to overview',
}: GcpRequestStatusViewProps) {
  const routes = useGcpRoutes();
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);
  const resolvedBackHref = backHref ?? routes.dashboard;

  const { status, loading, error, starting, isComplete, isFailed, refresh, retry } =
    useGcpProvisionStatus(requestId, Boolean(requestId));

  const [requestMeta, setRequestMeta] = useState<GcpRequest | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    void (async () => {
      try {
        const request = await getRequest(requestId);
        if (!cancelled) {
          setRequestMeta(request);
          setMetaError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setMetaError(err instanceof Error ? err.message : 'Failed to load request details.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, status?.status]);

  const steps = status?.steps ?? [];
  const progressPct = Math.min(100, Math.max(0, status?.progress ?? 0));
  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.status !== 'completed'));
  const completedCount = steps.filter((step) =>
    ['completed', 'complete'].includes(String(step.status).toLowerCase())
  ).length;
  const failedStep = steps.find(
    (step, index) =>
      mapStepStatus(step.status, index, activeStepIndex, isFailed) === 'failed'
  );

  const displayStatus = status?.status ?? requestMeta?.status ?? 'Pending';

  const stepRows = useMemo(
    () =>
      steps.map((step, index) => ({
        ...step,
        visualStatus: mapStepStatus(step.status, index, activeStepIndex, isFailed),
      })),
    [steps, activeStepIndex, isFailed]
  );

  if (!requestId) {
    return (
      <div className="mx-auto max-w-screen-xl">
        <ErrorState message="Invalid request ID." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-8">
      <Link
        href={resolvedBackHref}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '';
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {starting ? (
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting provisioning…
        </div>
      ) : null}

      {error && !status && !loading ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : null}

      {loading && !status ? <LoadingSkeleton /> : null}

      {status ? (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div
              className="h-1"
              style={{
                background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.65)}, ${accent})`,
              }}
            />
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-8">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1"
                  style={{
                    backgroundColor: soft,
                    color: accent,
                    ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
                  }}
                >
                  <Cloud className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: accent }}
                  >
                    Provisioning status
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                      {requestMeta ? getProjectName(requestMeta) : 'Lab request'}
                    </h1>
                    <GcpRequestStatusBadge status={displayStatus} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-gray-400">#{requestId.slice(-8)}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {requestMeta ? getCustomerEmail(requestMeta) : '—'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {isComplete
                      ? 'All provisioning steps completed.'
                      : isFailed && failedStep
                        ? `Stopped at: ${failedStep.label}`
                        : `${completedCount} of ${steps.length} steps complete`}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  className={RACKO_BTN_SECONDARY}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                {isFailed ? (
                  <button
                    type="button"
                    onClick={() => void retry()}
                    disabled={starting}
                    className={RACKO_BTN_PRIMARY}
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${starting ? 'animate-spin' : ''}`} />
                    Retry provisioning
                  </button>
                ) : null}
              </div>
            </div>

            {requestMeta ? (
              <div className="grid grid-cols-1 gap-3 border-t border-gray-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
                <MetaChip
                  icon={<MapPin className="h-4 w-4" />}
                  label="Region"
                  value={formatGcpRegion(requestMeta.region)}
                  accent={accent}
                  soft={soft}
                />
                <MetaChip
                  icon={<Users className="h-4 w-4" />}
                  label="Accounts"
                  value={String(getAccountCount(requestMeta))}
                  accent={accent}
                  soft={soft}
                />
                <MetaChip
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Est. price"
                  value={formatCurrency(getEstimatedPrice(requestMeta))}
                  accent={accent}
                  soft={soft}
                />
                <MetaChip
                  icon={<Calendar className="h-4 w-4" />}
                  label="Created"
                  value={formatRelativeTime(getCreatedAt(requestMeta))}
                  hint={
                    getCreatedAt(requestMeta)
                      ? formatDateTime(getCreatedAt(requestMeta))
                      : undefined
                  }
                  accent={accent}
                  soft={soft}
                />
              </div>
            ) : null}
          </div>

          {isComplete ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-green-900">Provisioning complete</h2>
                  <p className="mt-1 text-sm text-green-800">
                    Cloud Identity users and IAM roles are ready. Credentials have been sent to{' '}
                    <span className="font-medium">
                      {requestMeta ? getCustomerEmail(requestMeta) : 'the customer'}
                    </span>.
                  </p>
                  {status.gcpProjectId ? (
                    <p className="mt-2 font-mono text-xs text-green-800/90">
                      GCP project: {status.gcpProjectId}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {isFailed && (status.failureReason || failedStep) ? (
            <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50 shadow-sm">
              <div className="h-0.5" style={{ backgroundColor: accent }} />
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-red-900">
                      {failedStep?.label ? `${failedStep.label} failed` : 'Provisioning failed'}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-red-700">
                      {status.failureReason || status.message}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void retry()}
                  disabled={starting}
                  className={`shrink-0 ${RACKO_BTN_PRIMARY}`}
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${starting ? 'animate-spin' : ''}`} />
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-base font-semibold text-gray-900">Provisioning progress</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {completedCount} of {steps.length} steps · {progressPct}% complete
                </p>
                {status.message ? (
                  <p className="mt-1 text-sm text-gray-600">{status.message}</p>
                ) : null}
              </div>

              <div className="px-6 py-5">
                <div className="mb-6 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isComplete ? 'bg-green-600' : isFailed ? 'bg-red-500' : ''
                    }`}
                    style={{
                      width: `${progressPct}%`,
                      ...(isComplete || isFailed
                        ? {}
                        : {
                            background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.75)})`,
                          }),
                    }}
                  />
                </div>

                <ol className="space-y-1">
                  {stepRows.map((step, index) => (
                    <li
                      key={step.key}
                      className="flex items-start gap-3 rounded-lg px-2 py-3"
                      style={step.visualStatus === 'active' ? { backgroundColor: soft } : undefined}
                    >
                      <div className="flex flex-col items-center">
                        <StepIcon status={step.visualStatus} accent={accent} />
                        {index < stepRows.length - 1 ? (
                          <div
                            className={`mt-1 h-6 w-0.5 ${
                              step.visualStatus === 'complete' ? 'bg-green-200' : 'bg-gray-200'
                            }`}
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p
                          className={`text-sm font-medium ${
                            step.visualStatus === 'complete'
                              ? 'text-gray-900'
                              : step.visualStatus === 'failed'
                                ? 'text-red-700'
                                : step.visualStatus === 'active'
                                  ? ''
                                  : 'text-gray-500'
                          }`}
                          style={step.visualStatus === 'active' ? { color: accent } : undefined}
                        >
                          {step.label}
                        </p>
                        {step.visualStatus === 'active' ? (
                          <p className="mt-1 text-xs text-gray-400">In progress…</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">Request details</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500">Status</dt>
                    <dd className="mt-1">
                      <GcpRequestStatusBadge status={displayStatus} />
                    </dd>
                  </div>
                  {status.gcpProjectId ? (
                    <div>
                      <dt className="text-gray-500">GCP project</dt>
                      <dd className="mt-1 break-all font-mono text-xs font-medium text-gray-900">
                        {status.gcpProjectId}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-gray-500">Progress</dt>
                    <dd className="mt-1 font-medium text-gray-900">{progressPct}%</dd>
                  </div>
                </dl>
              </div>

              {metaError ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {metaError}
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
