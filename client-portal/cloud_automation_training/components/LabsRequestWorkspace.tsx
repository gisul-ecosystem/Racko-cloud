'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cloud,
  DollarSign,
  FilePlus2,
  Loader2,
  MapPin,
  Search,
  Server,
  Shield,
} from 'lucide-react';
import { ErrorState } from '../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../components/dashboard/LoadingSkeleton';
import { ApiError } from '../../lib/apiClient';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';
import { useCloudAccentColor } from '../../lib/cloudAccent';
import { hexToRgba, tenantAccentButton } from '../../lib/tenantAccentStyles';
import {
  RACKO_BTN_PRIMARY,
  RACKO_BTN_SECONDARY,
} from '../../cloud_automation/components/cloudButtonStyles';
import { COMMON_TIMEZONES } from '../../cloud_automation/constants';
import {
  addHoursToDateTimeLocal,
  clampTestIdsAccountCount,
  defaultEndDate,
  defaultStartDate,
  defaultTestIdsEndDate,
  defaultTestIdsStartDate,
  formatLocationOptionLabel,
  isProjectDetailsComplete,
  isValidCleanupTime,
  pickCheapestLocation,
  TEST_IDS_DEFAULTS,
  TEST_IDS_MAX_ACCOUNT_COUNT,
} from '../../cloud_automation/utils/requestForm';
import type {
  AzureIdMode,
  CostingMode,
  PricingEstimatePayload,
  ServiceCatalogResponse,
  UsageWindow,
} from '../../cloud_automation/types/catalog';
import { createRequestWithPricing, getServices } from '../../cloud_automation/api/client';
import { useAvailableLocations } from '../../cloud_automation/hooks/useAvailableLocations';
import { usePricingEstimate } from '../../cloud_automation/hooks/usePricingEstimate';
import { formatCurrency } from '../../cloud_automation/utils/formatters';
import { createLabEnrollment, listLabTemplates } from '../api/client';
import type { LabTemplate } from '../constants';
import { AZURE_LABS_SERVICE, CLOUD_LABS_ROUTES } from '../constants';
import { computeLabBillableHours, formatHoursLabel } from '../utils/labBillableHours';
import { buildLabProvisionBundle } from '../utils/labProvisionBundle';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';
const inputDisabledClass =
  'w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 shadow-sm';
const timeInputClass =
  'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500';
const sectionClass = 'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm';

const USAGE_WINDOW_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function optionCardClass(active: boolean) {
  return `flex w-full cursor-pointer flex-col rounded-lg border p-4 text-left transition ${
    active
      ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] ring-1 ring-[var(--cloud-accent,#B91C1C)]/20'
      : 'border-gray-200 bg-white hover:border-gray-300'
  }`;
}

function SectionHeader({
  step,
  title,
  description,
  accent,
  soft,
}: {
  step: number;
  title: string;
  description?: string;
  accent: string;
  soft: string;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-gray-100 pb-5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1"
        style={{ backgroundColor: soft, color: accent }}
      >
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-gray-500">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function instanceLabel(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    if (typeof record.name === 'string') return record.name;
    if (typeof record.label === 'string') return record.label;
  }
  return String(item);
}

function permissionLines(lab: LabTemplate): string[] {
  if (lab.permissions.summary?.length) return lab.permissions.summary;
  const lines: string[] = [];
  if (lab.permissions.workspaceRole) lines.push(`Workspace role: ${lab.permissions.workspaceRole}`);
  if (lab.permissions.onelakePermissions) {
    lines.push(`OneLake: ${lab.permissions.onelakePermissions}`);
  }
  if (lab.permissions.entraDirectoryRole) {
    lines.push(`Entra directory role: ${lab.permissions.entraDirectoryRole}`);
  }
  return lines.length > 0 ? lines : ['Permissions will be assigned from the lab template.'];
}

export function LabsRequestWorkspace() {
  const router = useRouter();
  const routes = useAzureRoutes();
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);

  const [labs, setLabs] = useState<LabTemplate[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalogResponse | null>(null);
  const [labsLoading, setLabsLoading] = useState(true);
  const [labsError, setLabsError] = useState<string | null>(null);
  const [labSearch, setLabSearch] = useState('');
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [changeLocationOpen, setChangeLocationOpen] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [idMode, setIdMode] = useState<AzureIdMode | null>(null);
  const [costingMode, setCostingMode] = useState<CostingMode>('shared');
  const [perUserBudgetUsd, setPerUserBudgetUsd] = useState<number | undefined>(undefined);
  const [customerEmail, setCustomerEmail] = useState('');
  const [accountCount, setAccountCount] = useState(10);
  const [startDate, setStartDate] = useState(() => defaultStartDate());
  const [endDate, setEndDate] = useState(() => defaultEndDate());
  const [usageWindows, setUsageWindows] = useState<UsageWindow[]>([]);
  const [usageWindowTimezone, setUsageWindowTimezone] = useState('Asia/Kolkata');
  const [resourceCleanupEnabled, setResourceCleanupEnabled] = useState(false);
  const [resourceCleanupTime, setResourceCleanupTime] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const loadLabs = async () => {
    setLabsLoading(true);
    setLabsError(null);
    try {
      const [data, serviceCatalog] = await Promise.all([listLabTemplates(), getServices()]);
      setLabs(data);
      setCatalog(serviceCatalog);
    } catch (err) {
      setLabsError(err instanceof Error ? err.message : 'Unable to load lab templates.');
    } finally {
      setLabsLoading(false);
    }
  };

  useEffect(() => {
    void loadLabs();
  }, []);

  const selectedLab = labs.find((lab) => lab.id === selectedLabId) ?? null;
  const isTestIds = idMode === 'test_ids';
  const labInstanceOptions = useMemo(
    () => (selectedLab?.instances ?? []).map(instanceLabel),
    [selectedLab]
  );

  const effectiveUsageWindows = useMemo(
    () =>
      isTestIds
        ? []
        : usageWindows.map((window) => ({ ...window, timezone: usageWindowTimezone })),
    [isTestIds, usageWindows, usageWindowTimezone]
  );

  const hoursEstimate = useMemo(
    () => computeLabBillableHours(startDate, endDate, effectiveUsageWindows),
    [startDate, endDate, effectiveUsageWindows]
  );

  const provisionBundle = useMemo(() => {
    if (!selectedLab || !catalog || selectedInstances.length === 0) return null;
    return buildLabProvisionBundle(selectedLab, catalog, selectedInstances, location || null);
  }, [selectedLab, catalog, selectedInstances, location]);

  const locationServiceIds = provisionBundle?.serviceIds ?? [];
  const locationSelectedInstances = provisionBundle?.selectedInstances ?? [];

  const {
    locations,
    loading: locationsLoading,
    error: locationsError,
  } = useAvailableLocations(locationServiceIds, locationSelectedInstances);

  const selectedLocationEntry = locations.find((entry) => entry.arm_region_name === location);
  const cheapestLocationId = useMemo(() => pickCheapestLocation(locations), [locations]);
  const isCheapestLocationSelected =
    Boolean(location) && location === cheapestLocationId;
  const locationSelectionKey = useMemo(
    () =>
      locationSelectedInstances
        .map((entry) => `${entry.serviceId}:${entry.instanceOption}`)
        .sort()
        .join('|'),
    [locationSelectedInstances]
  );

  useEffect(() => {
    setSelectedInstances([]);
    setLocation('');
    setChangeLocationOpen(false);
  }, [selectedLabId]);

  useEffect(() => {
    if (locations.length === 0) {
      if (location) setLocation('');
      return;
    }

    const stillValid = locations.some((entry) => entry.arm_region_name === location);
    if (!stillValid) {
      const preferred = String(selectedLab?.region || '')
        .trim()
        .toLowerCase();
      if (preferred && locations.some((entry) => entry.arm_region_name === preferred)) {
        setLocation(preferred);
        return;
      }
      setLocation(pickCheapestLocation(locations));
    }
  }, [locations, location, selectedLab?.region]);

  // When lab resources change, force region to cheapest/preferred among the new intersection.
  useEffect(() => {
    if (!locationSelectionKey || locations.length === 0) return;

    const preferred = String(selectedLab?.region || '')
      .trim()
      .toLowerCase();
    if (preferred && locations.some((entry) => entry.arm_region_name === preferred)) {
      setLocation(preferred);
      return;
    }
    setLocation(pickCheapestLocation(locations));
    setChangeLocationOpen(false);
  }, [locationSelectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pricingPayload = useMemo<PricingEstimatePayload | null>(() => {
    if (!provisionBundle || provisionBundle.serviceIds.length === 0) return null;
    if (!location || !startDate || !endDate || accountCount <= 0) return null;

    return {
      accountCount,
      serviceIds: provisionBundle.serviceIds,
      location,
      startDate,
      endDate,
      selectedInstances: provisionBundle.selectedInstances,
      selectedRoles: provisionBundle.selectedRoles,
      costingMode,
      usageWindows: effectiveUsageWindows,
    };
  }, [
    provisionBundle,
    location,
    accountCount,
    startDate,
    endDate,
    costingMode,
    effectiveUsageWindows,
  ]);

  const { pricing, loading: pricingLoading, error: pricingError } = usePricingEstimate(pricingPayload);

  const dynamicCost = useMemo(() => {
    if (!selectedLab) return null;

    const billableHours =
      typeof pricing?.billableHours === 'number' && pricing.billableHours > 0
        ? pricing.billableHours
        : hoursEstimate.billableHours;
    const calendarHours =
      typeof pricing?.calendarHours === 'number' && pricing.calendarHours > 0
        ? pricing.calendarHours
        : hoursEstimate.calendarHours;
    const usesUsageWindows =
      typeof pricing?.usesUsageWindows === 'boolean'
        ? pricing.usesUsageWindows
        : hoursEstimate.usesUsageWindows;

    const hourly =
      (typeof pricing?.infraHourlyTotal === 'number' ? pricing.infraHourlyTotal : null) ??
      (typeof pricing?.baseHourlyPrice === 'number' ? pricing.baseHourlyPrice : null) ??
      selectedLab.cost.capacityHourlyCostUsd ??
      (typeof pricing?.portalHourlyTotal === 'number' ? pricing.portalHourlyTotal : null);

    const apiTotal =
      typeof pricing?.totalPrice === 'number'
        ? pricing.totalPrice
        : typeof pricing?.estimatedPrice === 'number'
          ? pricing.estimatedPrice
          : null;

    const fabricFallback =
      selectedLab.kind === 'fabric' &&
      selectedLab.cost.capacityHourlyCostUsd != null &&
      billableHours > 0
        ? Number((selectedLab.cost.capacityHourlyCostUsd * billableHours).toFixed(2))
        : null;

    const estimatedTotalUsd =
      apiTotal != null && apiTotal > 0
        ? Number(apiTotal.toFixed(2))
        : fabricFallback != null
          ? fabricFallback
          : apiTotal != null
            ? Number(apiTotal.toFixed(2))
            : null;

    const currency = pricing?.currency || 'USD';
    const hoursLabel = formatHoursLabel(billableHours);
    const accountsLabel = `${accountCount} account${accountCount === 1 ? '' : 's'}`;

    return {
      billableHours,
      calendarHours,
      usesUsageWindows,
      hourly,
      estimatedTotalUsd,
      currency,
      pricingLoading,
      pricingError,
      subtitle:
        estimatedTotalUsd != null
          ? `${hoursLabel} · ${accountsLabel}`
          : billableHours > 0
            ? hoursLabel
            : 'Set dates to estimate',
      label:
        estimatedTotalUsd != null
          ? `${formatCurrency(estimatedTotalUsd, currency)} · ${hoursLabel}`
          : billableHours > 0
            ? hoursLabel
            : 'Set dates to estimate',
      regionLabel: selectedLocationEntry
        ? selectedLocationEntry.display_location
        : location || null,
    };
  }, [
    selectedLab,
    hoursEstimate,
    pricing,
    pricingLoading,
    pricingError,
    accountCount,
    location,
    selectedLocationEntry,
  ]);

  const filteredLabs = useMemo(() => {
    const q = labSearch.trim().toLowerCase();
    if (!q) return labs;
    return labs.filter(
      (lab) =>
        lab.name.toLowerCase().includes(q) ||
        lab.certTag.toLowerCase().includes(q) ||
        lab.cloud.toLowerCase().includes(q)
    );
  }, [labs, labSearch]);

  const detailsComplete = isProjectDetailsComplete({
    projectName,
    accountCount,
    startDate,
    endDate,
    idMode,
  });
  const labSelected = Boolean(selectedLab);
  const instancesComplete = labSelected && selectedInstances.length > 0;
  const locationComplete =
    instancesComplete &&
    Boolean(location) &&
    !locationsLoading &&
    locations.some((entry) => entry.arm_region_name === location);
  const emailComplete = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());

  const formProgress = [
    { label: 'Details', done: detailsComplete },
    { label: 'Labs', done: labSelected },
    { label: 'Instances', done: instancesComplete },
    { label: 'Region', done: locationComplete },
    { label: 'Accounts', done: emailComplete && accountCount > 0 },
  ];

  const handleIdModeChange = (mode: AzureIdMode) => {
    setIdMode(mode);
    if (mode === 'test_ids') {
      setAccountCount(TEST_IDS_DEFAULTS.accountCount);
      setCostingMode('per_user');
      setPerUserBudgetUsd(TEST_IDS_DEFAULTS.perUserBudgetUsd);
      setStartDate(defaultTestIdsStartDate());
      setEndDate(defaultTestIdsEndDate());
      setUsageWindows([]);
      setResourceCleanupEnabled(true);
      setResourceCleanupTime('23:00');
      return;
    }

    setCostingMode('shared');
    setPerUserBudgetUsd(undefined);
  };

  const toggleInstance = (name: string) => {
    setSelectedInstances((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  };

  const updateUsageWindowDay = (dayIndex: number, patch: Partial<UsageWindow>) => {
    setUsageWindows((windows) =>
      windows.map((window) => (window.day_of_week === dayIndex ? { ...window, ...patch } : window))
    );
  };

  const toggleUsageWindowDay = (dayIndex: number, enabled: boolean) => {
    if (!enabled) {
      setUsageWindows((windows) => windows.filter((window) => window.day_of_week !== dayIndex));
      return;
    }
    setUsageWindows((windows) => [
      ...windows.filter((window) => window.day_of_week !== dayIndex),
      {
        day_of_week: dayIndex,
        window_start_time: '09:00',
        window_end_time: '17:00',
        timezone: usageWindowTimezone,
        daily_limit_hours: undefined,
      },
    ]);
  };

  const handleSubmit = async () => {
    const errors: string[] = [];
    if (!detailsComplete) errors.push('Complete project details.');
    if (!selectedLab) errors.push('Select a lab.');
    if (selectedInstances.length === 0) errors.push('Select at least one instance/resource.');
    if (!location) {
      errors.push('Select an available deployment region for this lab.');
    } else if (
      locations.length > 0 &&
      !locations.some((entry) => entry.arm_region_name === location)
    ) {
      errors.push('Selected region is not available for this lab. Choose another region.');
    }
    if (!emailComplete) errors.push('Enter a valid customer email.');
    if (!Number.isInteger(accountCount) || accountCount <= 0) {
      errors.push('Account count must be a positive integer.');
    }
    if (resourceCleanupEnabled && !isValidCleanupTime(resourceCleanupTime)) {
      errors.push('Enter a valid daily cleanup time (HH:MM).');
    }
    if (
      costingMode === 'per_user' &&
      perUserBudgetUsd !== undefined &&
      (!Number.isFinite(perUserBudgetUsd) || perUserBudgetUsd <= 0)
    ) {
      errors.push('Per-user budget must be a positive number.');
    }

    setValidationErrors(errors);
    setSubmitError(null);
    if (errors.length > 0 || !selectedLab) return;

    setSubmitting(true);
    try {
      const serviceCatalog = catalog ?? (await getServices());
      if (!catalog) setCatalog(serviceCatalog);

      const bundle =
        provisionBundle && catalog
          ? provisionBundle
          : buildLabProvisionBundle(selectedLab, serviceCatalog, selectedInstances, location);

      if (bundle.serviceIds.length === 0) {
        throw new Error(
          bundle.missingServiceNames.length
            ? `Lab services not found in Azure catalog: ${bundle.missingServiceNames.join(', ')}.`
            : 'Unable to resolve lab services for provisioning.'
        );
      }

      const labProjectName = `${selectedLab.certTag} — ${projectName.trim()}`;

      const response = await createRequestWithPricing({
        customerEmail: customerEmail.trim(),
        accountCount,
        location,
        startDate,
        endDate,
        serviceIds: bundle.serviceIds,
        selectedRoles: bundle.selectedRoles,
        selectedInstances: bundle.selectedInstances,
        costingMode,
        projectName: labProjectName,
        idMode: idMode ?? undefined,
        labPermissionMode: bundle.labPermissionMode,
        resourceCleanupEnabled,
        ...(costingMode === 'per_user' && perUserBudgetUsd !== undefined
          ? { perUserBudgetUsd }
          : {}),
        ...(resourceCleanupEnabled && isValidCleanupTime(resourceCleanupTime)
          ? {
              resourceCleanupTime: resourceCleanupTime.trim(),
              resourceCleanupTimezone: usageWindowTimezone,
            }
          : {}),
        ...(idMode !== 'test_ids' && usageWindows.length > 0
          ? {
              usageWindows: usageWindows.map((window) => ({
                ...window,
                timezone: usageWindowTimezone,
              })),
            }
          : {}),
      });

      try {
        await createLabEnrollment({
          templateId: selectedLab.id,
          learnerEmail: customerEmail.trim(),
          accountCount,
          selectedInstances,
          projectName: labProjectName,
          startDate,
          endDate,
          azureRequestId: response.requestId,
        });
      } catch {
        // Azure request already created; status page still provisions accounts + email.
      }

      router.push(CLOUD_LABS_ROUTES.azureRequestStatus(response.requestId));
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to create lab request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  let step = 1;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-10">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="h-1"
          style={{
            background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.65)}, ${accent})`,
          }}
        />
        <div className="p-6 lg:p-8">
          <Link
            href={routes.dashboard}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:opacity-80"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '';
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1"
                style={{
                  backgroundColor: soft,
                  color: accent,
                  ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
                }}
              >
                <FilePlus2 className="h-7 w-7" />
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: accent }}
                >
                  {AZURE_LABS_SERVICE.name}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                  Create request
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                  Same request flow as Azure Services — select a lab and its instances, then
                  provision accounts with that lab&apos;s permissions.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Cloud className="h-4 w-4 shrink-0" style={{ color: accent }} />
              <span>Fields unlock step by step as you complete each section</span>
            </div>
          </div>
        </div>
      </div>

      {labsError && !labsLoading ? <ErrorState message={labsError} onRetry={loadLabs} /> : null}
      {labsLoading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <TableSkeleton rows={6} cols={1} embedded />
        </div>
      ) : null}

      {!labsLoading && !labsError ? (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: accent }}
              >
                Request progress
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {formProgress.filter((item) => item.done).length} of {formProgress.length} steps
                complete
              </p>
            </div>
            <ol className="grid grid-cols-2 gap-4 px-6 py-5 sm:grid-cols-4">
              {formProgress.map((item, index) => (
                <li key={item.label} className="relative flex items-center gap-3">
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      item.done ? 'text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-400'
                    }`}
                    style={item.done ? { backgroundColor: accent } : undefined}
                  >
                    {item.done ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className={`text-sm ${item.done ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
              {validationErrors.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-semibold text-red-800">Please fix the following</p>
                  <ul className="mt-2 space-y-1">
                    {validationErrors.map((error) => (
                      <li key={error}>• {error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <section className={sectionClass}>
                <div className="p-6">
                  <SectionHeader
                    step={step++}
                    title="Project details"
                    description="Name the lab, choose Azure ID type, and set the lab window."
                    accent={accent}
                    soft={soft}
                  />
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor="projectName">
                        Project name
                      </label>
                      <input
                        id="projectName"
                        className={inputClass}
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="e.g. Contoso Azure Lab"
                        maxLength={120}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <span className={labelClass}>Azure ID type</span>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => handleIdModeChange('test_ids')}
                          className={optionCardClass(idMode === 'test_ids')}
                        >
                          <div className="text-sm font-semibold text-gray-900">Azure test_ids</div>
                          <p className="mt-1 text-xs text-gray-500">
                            Short test labs with fixed defaults: up to {TEST_IDS_MAX_ACCOUNT_COUNT}{' '}
                            accounts and a 24-hour window.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleIdModeChange('azure_ids')}
                          className={optionCardClass(idMode === 'azure_ids')}
                        >
                          <div className="text-sm font-semibold text-gray-900">Azure IDs</div>
                          <p className="mt-1 text-xs text-gray-500">
                            Standard provisioning with full control over account count and duration.
                          </p>
                        </button>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <span className={labelClass}>Resource group costing</span>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[var(--cloud-accent,#B91C1C)] has-[:checked]:bg-[var(--cloud-accent-soft,#fef2f2)]">
                          <input
                            type="radio"
                            name="labCostingMode"
                            value="shared"
                            checked={costingMode === 'shared'}
                            onChange={() => {
                              setCostingMode('shared');
                              setPerUserBudgetUsd(undefined);
                            }}
                            disabled={isTestIds}
                            className="mt-1 h-4 w-4 border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                          />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">
                              Shared resource group
                            </span>
                            <span className="mt-1 block text-xs text-gray-500">
                              One resource group for all users. Best for shared labs and total
                              request costing.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[var(--cloud-accent,#B91C1C)] has-[:checked]:bg-[var(--cloud-accent-soft,#fef2f2)]">
                          <input
                            type="radio"
                            name="labCostingMode"
                            value="per_user"
                            checked={costingMode === 'per_user'}
                            onChange={() => setCostingMode('per_user')}
                            className="mt-1 h-4 w-4 border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                          />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">
                              Per-user resource groups
                            </span>
                            <span className="mt-1 block text-xs text-gray-500">
                              Separate resource group per user for isolated access and per-user
                              costing.
                            </span>
                          </span>
                        </label>
                      </div>
                      {isTestIds ? (
                        <p className="mt-2 text-xs text-gray-500">
                          Azure test_ids always use per-user resource groups.
                        </p>
                      ) : null}
                    </div>

                    {(costingMode === 'per_user' || isTestIds) && (
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor="perUserBudgetUsd">
                          Budget per user (USD){isTestIds ? '' : ' — optional'}
                        </label>
                        <input
                          id="perUserBudgetUsd"
                          type="number"
                          min={1}
                          step={0.01}
                          placeholder="e.g. 50.00"
                          className={isTestIds ? inputDisabledClass : inputClass}
                          value={perUserBudgetUsd ?? ''}
                          disabled={isTestIds}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPerUserBudgetUsd(value ? Number.parseFloat(value) : undefined);
                          }}
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          {isTestIds
                            ? 'Fixed at $10 for Azure test_ids. When spending exceeds this amount, the user is notified and suspended.'
                            : 'An Azure budget is created for each user with their own resource group.'}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className={labelClass} htmlFor="startDate">
                        Service start date
                      </label>
                      <input
                        id="startDate"
                        type="datetime-local"
                        className={inputClass}
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (isTestIds) setEndDate(addHoursToDateTimeLocal(e.target.value, 24));
                        }}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="endDate">
                        Service end date
                      </label>
                      <input
                        id="endDate"
                        type="datetime-local"
                        className={isTestIds ? inputDisabledClass : inputClass}
                        value={endDate}
                        disabled={isTestIds}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="accountCount">
                        Account count
                      </label>
                      <input
                        id="accountCount"
                        type="number"
                        min={1}
                        max={isTestIds ? TEST_IDS_MAX_ACCOUNT_COUNT : undefined}
                        className={inputClass}
                        value={accountCount}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          setAccountCount(
                            isTestIds ? clampTestIdsAccountCount(raw) : Math.max(1, Math.trunc(raw) || 1)
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {detailsComplete && !isTestIds ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Daily usage windows"
                      description="Optional — restrict which days and hours users can access the lab."
                      accent={accent}
                      soft={soft}
                    />
                    <div className="mt-5 space-y-3">
                      {USAGE_WINDOW_DAYS.map((day, index) => {
                        const existing = usageWindows.find((window) => window.day_of_week === index);
                        return (
                          <div
                            key={day}
                            className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex min-w-[132px] cursor-pointer items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={Boolean(existing)}
                                  onChange={(e) => toggleUsageWindowDay(index, e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)]"
                                />
                                <span className="text-sm font-medium text-gray-900">{day}</span>
                              </label>
                              {existing ? (
                                <div className="flex flex-1 flex-wrap items-center gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="time"
                                      className={timeInputClass}
                                      value={existing.window_start_time}
                                      onChange={(e) =>
                                        updateUsageWindowDay(index, {
                                          window_start_time: e.target.value,
                                        })
                                      }
                                    />
                                    <span className="text-xs text-gray-400">to</span>
                                    <input
                                      type="time"
                                      className={timeInputClass}
                                      value={existing.window_end_time}
                                      onChange={(e) =>
                                        updateUsageWindowDay(index, {
                                          window_end_time: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label
                                      className="text-xs font-medium text-gray-500"
                                      htmlFor={`daily-limit-${index}`}
                                    >
                                      Max hours/day
                                    </label>
                                    <input
                                      id={`daily-limit-${index}`}
                                      type="number"
                                      min={0.5}
                                      max={24}
                                      step={0.5}
                                      placeholder="No limit"
                                      value={existing.daily_limit_hours ?? ''}
                                      onChange={(e) =>
                                        updateUsageWindowDay(index, {
                                          daily_limit_hours: e.target.value
                                            ? parseFloat(e.target.value)
                                            : undefined,
                                        })
                                      }
                                      className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-1 focus:ring-[var(--cloud-accent,#B91C1C)]"
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4">
                      <label className={labelClass} htmlFor="usageWindowTimezone">
                        Timezone
                      </label>
                      <select
                        id="usageWindowTimezone"
                        className={inputClass}
                        value={usageWindowTimezone}
                        onChange={(e) => setUsageWindowTimezone(e.target.value)}
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
              ) : null}

              {detailsComplete && isTestIds ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Daily usage windows"
                      description="Disabled for Azure test_ids."
                      accent={accent}
                      soft={soft}
                    />
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Daily limit time is turned off for test IDs. Users can access the lab for the
                      full 24-hour window.
                    </div>
                  </div>
                </section>
              ) : null}

              {detailsComplete ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Resource cleanup"
                      description="Automatically clean up lab resources once per day at a time you choose."
                      accent={accent}
                      soft={soft}
                    />
                    <label className="mt-5 flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={resourceCleanupEnabled}
                        onChange={(e) => setResourceCleanupEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)]"
                      />
                      <span className="text-sm font-medium text-gray-900">
                        Enable daily resource cleanup
                      </span>
                    </label>
                    {resourceCleanupEnabled ? (
                      <div className="mt-4">
                        <label className={labelClass} htmlFor="cleanupTime">
                          Cleanup time
                        </label>
                        <input
                          id="cleanupTime"
                          type="time"
                          className={inputClass}
                          value={resourceCleanupTime}
                          onChange={(e) => setResourceCleanupTime(e.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {detailsComplete ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Azure Labs"
                      description="Select a certification lab. Permissions and resources come from the template."
                      accent={accent}
                      soft={soft}
                    />
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="search"
                          value={labSearch}
                          onChange={(e) => setLabSearch(e.target.value)}
                          placeholder="Search labs…"
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                      <p className="shrink-0 text-xs text-gray-500">
                        {selectedLab ? '1 selected' : '0 selected'} · {filteredLabs.length} available
                      </p>
                    </div>
                    <div className="mt-4 space-y-2">
                      {filteredLabs.map((lab) => {
                        const active = selectedLabId === lab.id;
                        return (
                          <button
                            key={lab.id}
                            type="button"
                            onClick={() => setSelectedLabId(lab.id)}
                            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                              active
                                ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] ring-1 ring-[var(--cloud-accent,#B91C1C)]/20'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                active
                                  ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent,#B91C1C)] text-white'
                                  : 'border-gray-300'
                              }`}
                            >
                              {active ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">
                                  {lab.certTag}
                                </span>
                                <span className="text-sm text-gray-700">{lab.name}</span>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {lab.kind === 'fabric' ? 'Microsoft Fabric' : 'Azure'}
                                {active && dynamicCost && dynamicCost.billableHours > 0
                                  ? ` · ${formatHoursLabel(dynamicCost.billableHours)}`
                                  : ''}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                              {active && dynamicCost
                                ? dynamicCost.label
                                : lab.cost.capacityHourlyCostUsd != null
                                  ? `from $${lab.cost.capacityHourlyCostUsd.toFixed(2)}/hr`
                                  : lab.cost.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

              {labSelected && labInstanceOptions.length > 0 ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Instance sizes / resources"
                      description={`Select the resources required for ${selectedLab?.certTag}.`}
                      accent={accent}
                      soft={soft}
                    />
                    {selectedLab?.capacitySku ? (
                      <p className="mt-4 text-sm text-gray-600">
                        Capacity:{' '}
                        <span className="font-medium text-gray-900">{selectedLab.capacitySku}</span>
                        {selectedLab.capacityBillingMode
                          ? ` · ${selectedLab.capacityBillingMode.toUpperCase()}`
                          : ''}
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {labInstanceOptions.map((name) => {
                        const active = selectedInstances.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => toggleInstance(name)}
                            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                              active
                                ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)]'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <Server className="h-4 w-4 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1 font-medium text-gray-900">{name}</span>
                            {active ? <Check className="h-4 w-4" style={{ color: accent }} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

              {instancesComplete && selectedLab ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Permissions"
                      description={`These roles are provisioned on every account for ${selectedLab.certTag}.`}
                      accent={accent}
                      soft={soft}
                    />
                    <ul className="mt-5 space-y-2">
                      {permissionLines(selectedLab).map((line) => (
                        <li
                          key={line}
                          className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm text-gray-700"
                        >
                          <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                          {line}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-gray-500">
                      {accountCount} account{accountCount === 1 ? '' : 's'} will be created with these
                      permissions.
                    </p>
                  </div>
                </section>
              ) : null}

              {instancesComplete ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Available location"
                      description="Only regions where this lab’s services and instances are available. Cheapest region is selected by default."
                      accent={accent}
                      soft={soft}
                    />
                    {locationsError ? (
                      <p className="mt-3 text-sm text-red-600">{locationsError}</p>
                    ) : null}
                    {!locationsLoading && !locationsError && locations.length === 0 ? (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        No Azure regions support the selected lab resources. Choose a different
                        instance configuration.
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                              Selected region
                            </p>
                            {locationsLoading ? (
                              <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading available regions…
                              </p>
                            ) : selectedLocationEntry ? (
                              <>
                                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                                  <MapPin
                                    className="mr-1 inline h-3.5 w-3.5"
                                    style={{ color: accent }}
                                  />
                                  {selectedLocationEntry.display_location}
                                  <span className="ml-1 font-normal text-gray-500">
                                    ({selectedLocationEntry.arm_region_name})
                                  </span>
                                </p>
                                {selectedLocationEntry.basePrice != null ? (
                                  <p className="mt-0.5 text-xs text-emerald-700">
                                    {isCheapestLocationSelected
                                      ? `Cheapest available · from $${Number(selectedLocationEntry.basePrice).toFixed(3)}/hr`
                                      : `From $${Number(selectedLocationEntry.basePrice).toFixed(3)}/hr`}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-xs text-gray-500">
                                    {isCheapestLocationSelected
                                      ? 'Auto-selected cheapest available region'
                                      : 'Selected for this lab'}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="mt-1 text-sm text-gray-500">No region selected yet</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setChangeLocationOpen((open) => !open)}
                            disabled={locationsLoading || locations.length === 0}
                            className={`inline-flex shrink-0 items-center justify-center rounded-lg border px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              changeLocationOpen
                                ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {changeLocationOpen ? 'Hide locations' : 'Change location'}
                          </button>
                        </div>

                        {changeLocationOpen ? (
                          <div className="relative">
                            <select
                              className={`${inputClass} appearance-none pr-10`}
                              value={location}
                              onChange={(event) => {
                                setLocation(event.target.value);
                                setChangeLocationOpen(false);
                              }}
                              disabled={locationsLoading || locations.length === 0}
                            >
                              <option value="" disabled>
                                {locationsLoading
                                  ? 'Loading regions…'
                                  : locations.length === 0
                                    ? 'No regions available'
                                    : 'Select a region'}
                              </option>
                              {locations.map((entry) => (
                                <option key={entry.arm_region_name} value={entry.arm_region_name}>
                                  {formatLocationOptionLabel(entry)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </section>
              ) : null}

              {instancesComplete ? (
                <section className={sectionClass}>
                  <div className="p-6">
                    <SectionHeader
                      step={step++}
                      title="Customer email"
                      description="Credentials and lab access details will be sent to this address."
                      accent={accent}
                      soft={soft}
                    />
                    <div className="mt-5">
                      <label className={labelClass} htmlFor="customerEmail">
                        Email ID
                      </label>
                      <input
                        id="customerEmail"
                        type="email"
                        className={inputClass}
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="learner@example.com"
                      />
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-20 space-y-4">
                <section className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: soft, color: accent }}
                    >
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Lab-wise cost
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedLab ? selectedLab.certTag : 'Select a lab'}
                      </p>
                    </div>
                  </div>
                  {selectedLab && dynamicCost ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        {dynamicCost.pricingLoading ? (
                          <p className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Calculating estimate…
                          </p>
                        ) : dynamicCost.estimatedTotalUsd != null ? (
                          <>
                            <p className="text-2xl font-bold" style={{ color: accent }}>
                              {formatCurrency(dynamicCost.estimatedTotalUsd, dynamicCost.currency)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">{dynamicCost.subtitle}</p>
                          </>
                        ) : (
                          <p className="text-lg font-semibold text-gray-700">
                            {formatHoursLabel(dynamicCost.billableHours) || '—'}
                          </p>
                        )}
                        {dynamicCost.pricingError ? (
                          <p className="mt-1 text-xs text-amber-600">{dynamicCost.pricingError}</p>
                        ) : null}
                      </div>

                      <div className="space-y-2 border-t border-gray-100 pt-3">
                        {dynamicCost.regionLabel ? (
                          <div className="flex justify-between gap-3">
                            <span className="text-gray-500">Region</span>
                            <span className="truncate font-medium text-right">
                              {dynamicCost.regionLabel}
                            </span>
                          </div>
                        ) : null}
                        {dynamicCost.hourly != null ? (
                          <div className="flex justify-between gap-3">
                            <span className="text-gray-500">
                              {selectedLab.kind === 'fabric' ? 'Capacity / hr' : 'Infra / hr'}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(dynamicCost.hourly, dynamicCost.currency)}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500">
                            {dynamicCost.usesUsageWindows ? 'Billable hours' : 'Duration'}
                          </span>
                          <span className="font-medium">
                            {formatHoursLabel(dynamicCost.billableHours)}
                          </span>
                        </div>
                        {dynamicCost.usesUsageWindows ? (
                          <div className="flex justify-between gap-3">
                            <span className="text-gray-500">Calendar hours</span>
                            <span className="font-medium text-gray-600">
                              {formatHoursLabel(dynamicCost.calendarHours)}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500">Accounts</span>
                          <span className="font-medium">{accountCount}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500">RG mode</span>
                          <span className="font-medium">
                            {costingMode === 'per_user' ? 'Per-user' : 'Shared'}
                          </span>
                        </div>
                        {dynamicCost.estimatedTotalUsd == null && !dynamicCost.pricingLoading ? (
                          <p className="text-xs text-gray-500">
                            Select lab resources, an available region, and dates to calculate a
                            price estimate.
                          </p>
                        ) : null}
                        <div className="flex justify-between gap-3 border-t border-gray-100 pt-2">
                          <span className="text-gray-500">Budget cap</span>
                          <span className="font-medium">
                            {selectedLab.cost.currency === 'INR' ? '₹' : '$'}
                            {selectedLab.cost.budgetCap.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500">
                      Pick a lab to see lab-wise cost and permissions.
                    </p>
                  )}
                </section>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || (instancesComplete && !locationComplete)}
                  className={`w-full ${RACKO_BTN_PRIMARY} py-3`}
                  style={tenantAccentButton(accent)}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating request…
                    </>
                  ) : locationsLoading && instancesComplete ? (
                    'Loading regions…'
                  ) : (
                    'Create request'
                  )}
                </button>
                {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
                <button type="button" onClick={loadLabs} className={`w-full ${RACKO_BTN_SECONDARY}`}>
                  Refresh labs
                </button>
              </div>
            </aside>

            <div className="space-y-3 xl:hidden">
              {selectedLab && dynamicCost ? (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Lab-wise cost · {selectedLab.certTag}
                  </p>
                  {dynamicCost.pricingLoading ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Calculating estimate…
                    </p>
                  ) : (
                    <p className="mt-2 text-lg font-bold" style={{ color: accent }}>
                      {dynamicCost.estimatedTotalUsd != null
                        ? formatCurrency(dynamicCost.estimatedTotalUsd, dynamicCost.currency)
                        : dynamicCost.label}
                    </p>
                  )}
                  {dynamicCost.estimatedTotalUsd != null ? (
                    <p className="mt-1 text-xs text-gray-500">{dynamicCost.subtitle}</p>
                  ) : dynamicCost.usesUsageWindows ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Based on daily usage windows (of {formatHoursLabel(dynamicCost.calendarHours)}{' '}
                      calendar)
                    </p>
                  ) : null}
                  {dynamicCost.pricingError ? (
                    <p className="mt-1 text-xs text-amber-600">{dynamicCost.pricingError}</p>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || (instancesComplete && !locationComplete)}
                className={`w-full ${RACKO_BTN_PRIMARY} py-3`}
                style={tenantAccentButton(accent)}
              >
                {submitting
                  ? 'Creating request…'
                  : locationsLoading && instancesComplete
                    ? 'Loading regions…'
                    : 'Create request'}
              </button>
              {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
