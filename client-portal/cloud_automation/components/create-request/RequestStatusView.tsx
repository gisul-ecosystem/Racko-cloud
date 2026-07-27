'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Cloud,
  DollarSign,
  FileSpreadsheet,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  Users,
  KeyRound,
} from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { useAzureRoutes } from '../../../lib/cloudPortalRoutes';
import { useCloudAccentColor } from '../../../lib/cloudAccent';
import { hexToRgba } from '../../../lib/tenantAccentStyles';
import { downloadCredentialSpreadsheet } from '../../api/client';
import { useProvisionStatus } from '../../hooks/useProvisionStatus';
import type { OrchestrationEvent, ProvisionSnapshot, ProvisionStepState } from '../../types/provisioning';
import { getCompletedStepCount } from '../../utils/provisionSnapshot';
import {
  formatAzureRegion,
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  getAccountCount,
  getCreatedAt,
  getCustomerEmail,
  getEstimatedPrice,
} from '../../utils/formatters';
import { RequestStatusBadge } from '../RequestStatusBadge';
import { RACKO_BTN_PRIMARY, RACKO_BTN_SECONDARY } from '../cloudButtonStyles';

interface RequestStatusViewProps {
  requestId: number;
  initialSnapshot?: ProvisionSnapshot | null;
  initialError?: string | null;
  backHref?: string;
  backLabel?: string;
}

function StepIcon({
  status,
  accent,
}: {
  status: ProvisionStepState['status'];
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

function EventIcon({ level }: { level: OrchestrationEvent['level'] }) {
  if (level === 'success') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
  if (level === 'error') return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
  return <Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />;
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

function formatAccessLinkStatus(status: string | null | undefined): string {
  const normalized = String(status || 'pending').trim().toLowerCase();
  if (!normalized) return 'Pending';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getSelectedLicenseLabel(
  request: ProvisionSnapshot['request']
): string | null {
  if (!request) return null;
  const skuId = request.microsoftLicenseSkuId || request.microsoft_license_sku_id;
  if (!skuId) return null;
  const partNumber =
    request.microsoftLicenseSkuPartNumber || request.microsoft_license_sku_part_number;
  if (!partNumber) return 'Selected for lab accounts';
  return String(partNumber)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseResourceGroupNames(value: string | null | undefined): string[] {
  if (!value) return [];

  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === 'pending') {
    return [];
  }

  return normalized
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function ResourceGroupChips({ value }: { value: string | null | undefined }) {
  const names = parseResourceGroupNames(value);

  if (names.length === 0) {
    return <span className="text-sm font-medium text-gray-900">Pending</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="inline-block max-w-full break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] font-medium leading-snug text-gray-700"
          title={name}
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3.5">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm font-medium text-gray-900">{children}</dd>
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
          <div className="h-2 rounded-full bg-gray-100" />
        </div>
        <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-4 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RequestStatusView({
  requestId,
  initialSnapshot = null,
  initialError = null,
  backHref,
  backLabel = 'Back to overview',
}: RequestStatusViewProps) {
  const AZURE_ROUTES = useAzureRoutes();
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);
  const resolvedBackHref = backHref ?? AZURE_ROUTES.dashboard;
  const [tipsOpen, setTipsOpen] = useState(false);
  const [downloadingSpreadsheet, setDownloadingSpreadsheet] = useState(false);
  const [spreadsheetError, setSpreadsheetError] = useState<string | null>(null);
  const { snapshot, steps, summary, events, loading, error, isComplete, refresh, retryFailedStep } =
    useProvisionStatus({
      requestId,
      initialSnapshot,
      initialError,
    });

  const completedCount = getCompletedStepCount(steps);
  const progressPct = Math.round((completedCount / steps.length) * 100);
  const request = snapshot?.request ?? null;
  const failedStep = steps.find((step) => step.status === 'failed');
  const regionLabel = formatAzureRegion(request?.location);
  const customerEmail = request ? getCustomerEmail(request) : '—';
  const createdAt = request ? getCreatedAt(request) : null;
  const licenseLabel = getSelectedLicenseLabel(request);
  const spreadsheetAvailable = Boolean(snapshot?.credentials?.spreadsheetAvailable);

  const handleDownloadSpreadsheet = async () => {
    setSpreadsheetError(null);
    setDownloadingSpreadsheet(true);

    try {
      await downloadCredentialSpreadsheet(requestId);
    } catch (downloadError) {
      setSpreadsheetError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Failed to download credential spreadsheet.'
      );
    } finally {
      setDownloadingSpreadsheet(false);
    }
  };

  if (!Number.isInteger(requestId) || requestId <= 0) {
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

      {error && !snapshot && !loading ? (
        <ErrorState message={error} onRetry={() => void refresh(true)} />
      ) : null}

      {loading && !snapshot ? <LoadingSkeleton /> : null}

      {snapshot ? (
        <>
          {/* Header */}
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
                      Request #{requestId}
                    </h1>
                    {request ? <RequestStatusBadge status={request.status ?? 'Provisioning'} /> : null}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{customerEmail}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {isComplete
                      ? 'All provisioning steps completed.'
                      : failedStep
                        ? `Stopped at: ${failedStep.label}`
                        : `${completedCount} of ${steps.length} steps complete`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void refresh(true)}
                disabled={loading}
                className={`shrink-0 self-start ${RACKO_BTN_SECONDARY}`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {request ? (
              <div className="grid grid-cols-1 gap-3 border-t border-gray-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
                <MetaChip
                  icon={<MapPin className="h-4 w-4" />}
                  label="Region"
                  value={regionLabel}
                  accent={accent}
                  soft={soft}
                />
                <MetaChip
                  icon={<Users className="h-4 w-4" />}
                  label="Accounts"
                  value={String(getAccountCount(request))}
                  accent={accent}
                  soft={soft}
                />
                <MetaChip
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Est. price"
                  value={formatCurrency(getEstimatedPrice(request))}
                  accent={accent}
                  soft={soft}
                />
                <MetaChip
                  icon={<Calendar className="h-4 w-4" />}
                  label="Created"
                  value={formatRelativeTime(createdAt)}
                  hint={createdAt ? formatDateTime(createdAt) : undefined}
                  accent={accent}
                  soft={soft}
                />
              </div>
            ) : null}
          </div>

          {/* Alerts */}
          {isComplete ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-green-900">Provisioning complete</h2>
                  <p className="mt-1 text-sm text-green-800">
                    Access credentials have been queued or sent to{' '}
                    <span className="font-medium">{customerEmail}</span>. An Excel file with the
                    portal link and all learner usernames and passwords is attached to the email and
                    available for download below.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {failedStep ? (
            <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50 shadow-sm">
              <div className="h-0.5" style={{ backgroundColor: accent }} />
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-red-900">{failedStep.label} failed</h2>
                    <p className="mt-1 text-sm leading-relaxed text-red-700">{failedStep.error}</p>
                    {failedStep.key === 'credentials' ? (
                      <p className="mt-2 text-xs text-red-600/90">
                        Ensure cloud automation has FRONTEND_URL set and email delivery is configured,
                        then retry sending the access link.
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void retryFailedStep()}
                  disabled={loading}
                  className={`shrink-0 ${RACKO_BTN_PRIMARY}`}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Retry step
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Progress */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Provisioning progress</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {completedCount} of {steps.length} steps · {progressPct}% complete
                  </p>
                </div>

                <div className="px-6 py-5">
                  <div className="mb-6 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isComplete ? 'bg-green-600' : failedStep ? 'bg-red-500' : ''
                      }`}
                      style={{
                        width: `${progressPct}%`,
                        ...(isComplete || failedStep
                          ? {}
                          : {
                              background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.75)})`,
                            }),
                      }}
                    />
                  </div>

                  <ol className="space-y-1">
                    {steps.map((step, index) => (
                      <li
                        key={step.key}
                        className="flex items-start gap-3 rounded-lg px-2 py-3"
                        style={
                          step.status === 'active' ? { backgroundColor: soft } : undefined
                        }
                      >
                        <div className="flex flex-col items-center">
                          <StepIcon status={step.status} accent={accent} />
                          {index < steps.length - 1 ? (
                            <div
                              className={`mt-1 h-6 w-0.5 ${
                                step.status === 'complete' ? 'bg-green-200' : 'bg-gray-200'
                              }`}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p
                            className={`text-sm font-medium ${
                              step.status === 'complete'
                                ? 'text-gray-900'
                                : step.status === 'failed'
                                  ? 'text-red-700'
                                  : step.status === 'active'
                                    ? ''
                                    : 'text-gray-500'
                            }`}
                            style={step.status === 'active' ? { color: accent } : undefined}
                          >
                            {step.label}
                          </p>
                          {step.error ? (
                            <p className="mt-1 text-xs text-red-600">{step.error}</p>
                          ) : null}
                          {step.status === 'active' && !step.error ? (
                            <p className="mt-1 text-xs text-gray-400">
                              {step.key === 'users' && licenseLabel
                                ? `Creating accounts and assigning ${licenseLabel}…`
                                : 'In progress…'}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Timeline */}
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Activity log</h2>
                  <p className="mt-0.5 text-xs text-gray-400">Recent provisioning events from the backend</p>
                </div>
                <div className="max-h-96 overflow-y-auto px-6 py-4">
                  {events.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">
                      Waiting for provisioning events…
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {events.map((event) => (
                        <li key={event.id} className="flex gap-3 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                          <EventIcon level={event.level} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800">{event.message}</p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {formatRelativeTime(event.timestamp)}
                              <span className="mx-1 text-gray-300">·</span>
                              {formatDateTime(event.timestamp)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6">
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Request details</h2>
                  <p className="mt-0.5 text-xs text-gray-400">Live values from the backend</p>
                </div>
                <dl className="divide-y divide-gray-50 px-6">
                  <DetailRow label="Request ID">
                    <span>#{requestId}</span>
                  </DetailRow>
                  <DetailRow label="Customer">
                    <span className="break-all">{customerEmail}</span>
                  </DetailRow>
                  <DetailRow label="Lab region">{regionLabel}</DetailRow>
                  {licenseLabel ? (
                    <DetailRow label="Microsoft license">
                      <span className="inline-flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-gray-400" />
                        {licenseLabel}
                      </span>
                    </DetailRow>
                  ) : null}
                  <DetailRow label="Resource groups">
                    <ResourceGroupChips value={summary?.resourceGroup} />
                  </DetailRow>
                  <DetailRow label="Services configured">
                    {String(snapshot.services?.count ?? 0)}
                  </DetailRow>
                  <DetailRow label="Users created">{String(summary?.usersCreated ?? 0)}</DetailRow>
                  <DetailRow label="Roles assigned">{String(summary?.rolesAssigned ?? 0)}</DetailRow>
                  <DetailRow label="Access link">
                    <span className="inline-flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-gray-400" />
                      {formatAccessLinkStatus(summary?.accessLinkStatus)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Last refresh">
                    <span title={formatDateTime(summary?.lastRefresh)}>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        {formatRelativeTime(summary?.lastRefresh)}
                      </span>
                    </span>
                  </DetailRow>
                </dl>
              </div>

              {isComplete && request?.location ? (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setTipsOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <Info className="h-4 w-4" style={{ color: accent }} />
                      Azure Portal tips
                    </span>
                    <ChevronRight
                      className={`h-4 w-4 text-gray-400 transition ${tipsOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {tipsOpen ? (
                    <div className="space-y-3 border-t border-gray-100 px-6 py-4 text-sm text-gray-600">
                      <p>
                        When creating VMs or resources, set <strong>Region</strong> to{' '}
                        <span className="font-medium text-gray-900">{regionLabel}</span> (
                        <code className="rounded bg-gray-100 px-1 text-xs">{request.location}</code>
                        ). The portal often defaults to East US.
                      </p>
                      <p>
                        For B-series VMs, set <strong>Availability options</strong> to{' '}
                        <span className="font-medium text-gray-900">
                          No infrastructure redundancy required
                        </span>
                        . Use sizes like <span className="font-medium">Standard_B1s</span> or{' '}
                        <span className="font-medium">Standard_B1ms</span>.
                      </p>
                    </div>
                  ) : (
                    <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
                      Tap to view region and VM sizing guidance for students.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
                <div className="mt-3 space-y-2">
                  {spreadsheetAvailable ? (
                    <button
                      type="button"
                      onClick={() => void handleDownloadSpreadsheet()}
                      disabled={downloadingSpreadsheet}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:border-[var(--cloud-accent,#B91C1C)] hover:bg-[var(--cloud-accent-soft,#fef2f2)] hover:text-[var(--cloud-accent,#B91C1C)] disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-2">
                        {downloadingSpreadsheet ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="h-4 w-4" />
                        )}
                        Download credentials (Excel)
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </button>
                  ) : null}
                  <Link
                    href={AZURE_ROUTES.createRequest}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:border-[var(--cloud-accent,#B91C1C)] hover:bg-[var(--cloud-accent-soft,#fef2f2)] hover:text-[var(--cloud-accent,#B91C1C)]"
                  >
                    New request
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                  <Link
                    href={resolvedBackHref}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Back to dashboard
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </div>
                {spreadsheetError ? (
                  <p className="mt-3 text-xs text-red-600">{spreadsheetError}</p>
                ) : spreadsheetAvailable ? (
                  <p className="mt-3 text-xs text-gray-400">
                    Includes portal link, admin login, and all learner usernames and passwords.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
