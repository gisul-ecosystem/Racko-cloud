'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Search, Shield, X } from 'lucide-react';
import { COMMON_TIMEZONES } from '../../constants';
import { RACKO_BTN_PRIMARY, RACKO_BTN_SECONDARY } from '../cloudButtonStyles';
import type {
  AvailableLocation,
  AzureIdMode,
  CatalogInstance,
  CatalogService,
  CostingMode,
  MicrosoftLicense,
  PurchaseCloneCustomRole,
  PurchaseCloneCustomService,
  SelectedRole,
  ServiceCatalogResponse,
  SelectedInstance,
  UsageWindow,
} from '../../types/catalog';
import {
  catalogInstancesForServices,
  clampTestIdsAccountCount,
  formatLocationOptionLabel,
  getInstancePortalTips,
  getSelectedPauseCleanupServices,
  isProjectDetailsComplete,
  isVmCatalogService,
  normalizeServiceId,
  parseInstanceGuide,
  pickCheapestLocation,
  TEST_IDS_MAX_ACCOUNT_COUNT,
  DELETE_CLEANUP_ACTION_LABELS,
  PAUSE_CLEANUP_ACTION_LABELS,
  supportsPauseCleanup,
} from '../../utils/requestForm';
import { InstanceOptionCard } from './InstanceOptionCard';
import { ServiceOptionCard } from './ServiceOptionCard';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';

const inputDisabledClass =
  'w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 shadow-sm';

const timeInputClass =
  'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500';

const sectionClass = 'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm';

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
}: {
  step: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-gray-100 pb-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cloud-accent-soft,#fef2f2)] text-sm font-bold text-[var(--cloud-accent,#B91C1C)] ring-1 ring-[var(--cloud-accent,#B91C1C)]/10">
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

const USAGE_WINDOW_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

interface RequestFormProps {
  catalog: ServiceCatalogResponse;
  selectedServiceIds: number[];
  onToggleService: (serviceId: number) => void;
  location: string;
  onLocationChange: (location: string) => void;
  locations: AvailableLocation[];
  locationsLoading: boolean;
  locationsError: string | null;
  selectedInstances: SelectedInstance[];
  onSelectInstance: (serviceId: number, instanceOption: string) => void;
  manualRoles: Record<number, string[]>;
  onRoleChange: (serviceId: number, roles: string[]) => void;
  tierAutomatedServices: Set<number>;
  resolvedRoles: SelectedRole[];
  orgAdminCustomRoles?: PurchaseCloneCustomRole[];
  orgAdminCustomServices?: PurchaseCloneCustomService[];
  projectName: string;
  onProjectNameChange: (value: string) => void;
  idMode: AzureIdMode | null;
  onIdModeChange: (value: AzureIdMode) => void;
  purchaseConvertMode?: boolean;
  customerEmail: string;
  onCustomerEmailChange: (value: string) => void;
  accountCount: number;
  onAccountCountChange: (value: number) => void;
  costingMode: CostingMode;
  onCostingModeChange: (value: CostingMode) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  usageWindows: UsageWindow[];
  onUsageWindowsChange: (windows: UsageWindow[]) => void;
  usageWindowTimezone: string;
  onUsageWindowTimezoneChange: (value: string) => void;
  resourceCleanupEnabled: boolean;
  onResourceCleanupEnabledChange: (value: boolean) => void;
  resourceCleanupTime: string;
  onResourceCleanupTimeChange: (value: string) => void;
  resourceCleanupAction: 'delete' | 'pause';
  onResourceCleanupActionChange: (value: 'delete' | 'pause') => void;
  perUserBudgetUsd?: number;
  onPerUserBudgetUsdChange: (value: number | undefined) => void;
  licenses: MicrosoftLicense[];
  licensesLoading: boolean;
  licensesError: string | null;
  selectedLicenseSkuId: string;
  onSelectedLicenseSkuIdChange: (value: string) => void;
  adminAccessOpen: boolean;
  onAdminAccessOpenChange: (value: boolean) => void;
  adminAccessServiceId: number | null;
  onAdminAccessServiceIdChange: (value: number | null) => void;
  adminAccessText: string;
  onAdminAccessTextChange: (value: string) => void;
  onSubmitAdminAccess: () => void;
  adminAccessSubmitting: boolean;
  adminAccessMessage: string | null;
  privilegedRoleOpen: boolean;
  onPrivilegedRoleOpenChange: (value: boolean) => void;
  privilegedRoles: { name: string; definitionId: string }[];
  privilegedRolesLoading: boolean;
  selectedPrivilegedRole: string;
  onSelectedPrivilegedRoleChange: (value: string) => void;
  onSubmitPrivilegedRoleRequest: () => void;
  privilegedRoleSubmitting: boolean;
  privilegedRoleSubmitted: boolean;
  privilegedRoleMessage: string | null;
  privilegedRoleMessageType: 'success' | 'error' | null;
  validationErrors: string[];
  /** Cloud Labs / Azure Labs: hide services, instances, and costing UI. */
  labsMode?: boolean;
}

function groupServicesByCategory(services: CatalogService[]) {
  const groups = new Map<string, CatalogService[]>();
  for (const service of services) {
    const category = service.category || 'General';
    const list = groups.get(category) ?? [];
    list.push(service);
    groups.set(category, list);
  }
  return groups;
}

function serviceDisplayName(service: CatalogService) {
  return service.service_name || service.name || '';
}

function serviceMatchesQuery(service: CatalogService, query: string) {
  if (!query) return true;
  const haystack = [
    serviceDisplayName(service),
    service.description || '',
    service.category || '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function getRolesForService(catalog: ServiceCatalogResponse, serviceId: number): string[] {
  return catalog.roles
    .filter((role) => role.serviceId === serviceId)
    .map((role) => role.azure_role);
}

function instancesComplete(
  catalog: ServiceCatalogResponse,
  selectedServiceIds: number[],
  selectedInstances: SelectedInstance[]
): boolean {
  for (const serviceId of selectedServiceIds) {
    const service = catalog.services.find((entry) => entry.id === serviceId);
    if (service?.supports_instances) {
      const hasInstance = selectedInstances.some((entry) => entry.serviceId === serviceId);
      if (!hasInstance) return false;
    }
  }
  return true;
}

function rolesComplete(
  catalog: ServiceCatalogResponse,
  selectedServiceIds: number[],
  resolvedRoles: SelectedRole[]
): boolean {
  const servicesRequiringRoles = selectedServiceIds.filter((serviceId) => {
    const service = catalog.services.find((entry) => entry.id === serviceId);
    return service?.role_required !== false;
  });
  const servicesWithRoles = new Set(resolvedRoles.map((entry) => entry.serviceId));
  return servicesRequiringRoles.every((serviceId) => servicesWithRoles.has(serviceId));
}

export function RequestForm({
  catalog,
  selectedServiceIds,
  onToggleService,
  location,
  onLocationChange,
  locations,
  locationsLoading,
  locationsError,
  selectedInstances,
  onSelectInstance,
  manualRoles,
  onRoleChange,
  tierAutomatedServices,
  resolvedRoles,
  orgAdminCustomRoles = [],
  orgAdminCustomServices = [],
  projectName,
  onProjectNameChange,
  idMode,
  onIdModeChange,
  purchaseConvertMode = false,
  customerEmail,
  onCustomerEmailChange,
  accountCount,
  onAccountCountChange,
  costingMode,
  onCostingModeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  usageWindows,
  onUsageWindowsChange,
  usageWindowTimezone,
  onUsageWindowTimezoneChange,
  resourceCleanupEnabled,
  onResourceCleanupEnabledChange,
  resourceCleanupTime,
  onResourceCleanupTimeChange,
  resourceCleanupAction,
  onResourceCleanupActionChange,
  perUserBudgetUsd,
  onPerUserBudgetUsdChange,
  licenses,
  licensesLoading,
  licensesError,
  selectedLicenseSkuId,
  onSelectedLicenseSkuIdChange,
  adminAccessOpen,
  onAdminAccessOpenChange,
  adminAccessServiceId,
  onAdminAccessServiceIdChange,
  adminAccessText,
  onAdminAccessTextChange,
  onSubmitAdminAccess,
  adminAccessSubmitting,
  adminAccessMessage,
  privilegedRoleOpen,
  onPrivilegedRoleOpenChange,
  privilegedRoles,
  privilegedRolesLoading,
  selectedPrivilegedRole,
  onSelectedPrivilegedRoleChange,
  onSubmitPrivilegedRoleRequest,
  privilegedRoleSubmitting,
  privilegedRoleSubmitted,
  privilegedRoleMessage,
  privilegedRoleMessageType,
  validationErrors,
  labsMode = false,
}: RequestFormProps) {
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategory, setServiceCategory] = useState<string>('All');
  const [instanceSearchByService, setInstanceSearchByService] = useState<Record<number, string>>(
    {}
  );
  const [changeLocationOpen, setChangeLocationOpen] = useState(false);

  const selectedServices = catalog.services.filter((service) =>
    selectedServiceIds.includes(normalizeServiceId(service.id))
  );

  const servicesForPicker = useMemo(() => {
    if (!purchaseConvertMode) return catalog.services;
    const selected = new Set(selectedServiceIds.map((id) => normalizeServiceId(id)));
    return catalog.services.filter((service) => selected.has(normalizeServiceId(service.id)));
  }, [catalog.services, purchaseConvertMode, selectedServiceIds]);

  const serviceCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const service of servicesForPicker) {
      categories.add(service.category || 'General');
    }
    return ['All', ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
  }, [servicesForPicker]);

  const filteredServicesByCategory = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    const filtered = servicesForPicker.filter((service) => {
      const category = service.category || 'General';
      if (serviceCategory !== 'All' && category !== serviceCategory) return false;
      return serviceMatchesQuery(service, query);
    });
    return groupServicesByCategory(filtered);
  }, [servicesForPicker, serviceCategory, serviceSearch]);

  const filteredServiceCount = useMemo(() => {
    let count = 0;
    for (const services of filteredServicesByCategory.values()) {
      count += services.length;
    }
    return count;
  }, [filteredServicesByCategory]);
  const instanceServices = selectedServices.filter((service) => service.supports_instances);
  const catalogInstances = catalogInstancesForServices(catalog.instances, selectedServiceIds);
  const isTestIds = idMode === 'test_ids';

  const detailsComplete = isProjectDetailsComplete({
    projectName,
    accountCount,
    startDate,
    endDate,
    idMode,
  });
  const pauseCleanupAvailable = supportsPauseCleanup(catalog, selectedServiceIds);
  const selectedPauseCleanupServices = getSelectedPauseCleanupServices(catalog, selectedServiceIds);
  const effectiveCleanupAction = pauseCleanupAvailable ? resourceCleanupAction : 'delete';
  const showServices = detailsComplete;
  const showInstances = showServices && selectedServiceIds.length > 0;
  const showPermissions =
    showInstances && instancesComplete(catalog, selectedServiceIds, selectedInstances);
  const showLicense = showPermissions;
  const showEmail =
    showLicense && rolesComplete(catalog, selectedServiceIds, resolvedRoles);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailComplete = emailPattern.test(customerEmail.trim());
  const showLocations = showEmail && emailComplete;

  const selectedLocationEntry = locations.find((entry) => entry.arm_region_name === location);
  const cheapestLocationId = useMemo(() => pickCheapestLocation(locations), [locations]);
  const isCheapestLocationSelected =
    Boolean(location) && location === cheapestLocationId;
  const selectedVmPortalTips = instanceServices
    .filter((service) => isVmCatalogService(service))
    .flatMap((service) => {
      const serviceId = normalizeServiceId(service.id);
      const selectedOption = selectedInstances.find((entry) => entry.serviceId === serviceId)
        ?.instanceOption;
      const instance = catalogInstances.find(
        (entry) =>
          normalizeServiceId(entry.serviceId) === serviceId &&
          entry.option_name === selectedOption
      );
      return getInstancePortalTips(instance?.guide);
    });

  const updateUsageWindowDay = (dayIndex: number, patch: Partial<UsageWindow>) => {
    onUsageWindowsChange(
      usageWindows.map((window) =>
        window.day_of_week === dayIndex ? { ...window, ...patch } : window
      )
    );
  };

  const toggleUsageWindowDay = (dayIndex: number, enabled: boolean) => {
    if (!enabled) {
      onUsageWindowsChange(usageWindows.filter((window) => window.day_of_week !== dayIndex));
      return;
    }

    onUsageWindowsChange([
      ...usageWindows.filter((window) => window.day_of_week !== dayIndex),
      {
        day_of_week: dayIndex,
        window_start_time: '09:00',
        window_end_time: '17:00',
        timezone: usageWindowTimezone,
        daily_limit_hours: undefined,
      },
    ]);
  };

  let step = 1;

  return (
    <div className="space-y-6">
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">Please fix the following</p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {validationErrors.map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <section className={sectionClass}>
        <div className="p-6">
          <SectionHeader
            step={step++}
            title="Project details"
            description={
              labsMode
                ? 'Name the lab, choose Azure ID type, and set the lab window.'
                : 'Name the lab, choose Azure ID type, then set costing and the service window.'
            }
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="projectName">
                Project name
              </label>
              <input
                id="projectName"
                type="text"
                className={inputClass}
                value={projectName}
                onChange={(event) => onProjectNameChange(event.target.value)}
                placeholder="e.g. Contoso Azure Lab"
                maxLength={120}
              />
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Azure ID type</span>
              {purchaseConvertMode ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Purchasing full Azure IDs from your test lab. Services, permissions, and license
                  stay the same as the test request.
                </div>
              ) : (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onIdModeChange('test_ids')}
                    className={optionCardClass(idMode === 'test_ids')}
                  >
                    <div className="text-sm font-semibold text-gray-900">Azure test_ids</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      Short test labs with fixed defaults: 5 accounts, 24-hour window, $10 budget,
                      cleanup every 24 hours, and daily limits disabled.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onIdModeChange('azure_ids')}
                    className={optionCardClass(idMode === 'azure_ids')}
                  >
                    <div className="text-sm font-semibold text-gray-900">Azure IDs</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      Standard provisioning with full control over account count, duration, cleanup,
                      and daily usage windows.
                    </p>
                  </button>
                </div>
              )}
            </div>

            {!labsMode ? (
            <div className="sm:col-span-2">
              <span className={labelClass}>Resource group costing</span>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[var(--cloud-accent,#B91C1C)] has-[:checked]:bg-[var(--cloud-accent-soft,#fef2f2)]">
                  <input
                    type="radio"
                    name="costingMode"
                    value="shared"
                    checked={costingMode === 'shared'}
                    onChange={() => onCostingModeChange('shared')}
                    disabled={isTestIds}
                    className="mt-1 h-4 w-4 border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Shared resource group</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      One resource group for all users. Best for shared labs and total request costing.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[var(--cloud-accent,#B91C1C)] has-[:checked]:bg-[var(--cloud-accent-soft,#fef2f2)]">
                  <input
                    type="radio"
                    name="costingMode"
                    value="per_user"
                    checked={costingMode === 'per_user'}
                    onChange={() => onCostingModeChange('per_user')}
                    className="mt-1 h-4 w-4 border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Per-user resource groups</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      Separate resource group per user for isolated access and per-user costing.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            ) : null}

            <div>
              <label className={labelClass} htmlFor="startDate">
                Service start date
              </label>
              <input
                id="startDate"
                type="datetime-local"
                className={inputClass}
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="endDate">
                Service end date
              </label>
              <input
                id="endDate"
                type="datetime-local"
                className={isTestIds && !purchaseConvertMode ? inputDisabledClass : inputClass}
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                disabled={isTestIds && !purchaseConvertMode}
              />
            </div>
            {isTestIds && !purchaseConvertMode ? (
              <p className="sm:col-span-2 text-xs text-gray-500">
                Choose when the test lab starts. End date is fixed at 24 hours after the start.
              </p>
            ) : null}

            {(idMode || purchaseConvertMode) ? (
              <div>
                <label className={labelClass} htmlFor="accountCount">
                  Account count
                </label>
                <input
                  id="accountCount"
                  type="number"
                  min={1}
                  max={isTestIds && !purchaseConvertMode ? TEST_IDS_MAX_ACCOUNT_COUNT : undefined}
                  className={inputClass}
                  value={accountCount}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    onAccountCountChange(
                      isTestIds && !purchaseConvertMode
                        ? clampTestIdsAccountCount(raw)
                        : raw
                    );
                  }}
                />
                {isTestIds && !purchaseConvertMode ? (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Select 1–{TEST_IDS_MAX_ACCOUNT_COUNT} accounts for Azure test_ids.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {detailsComplete && !isTestIds && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Daily usage windows"
              description="Optional — restrict which days and hours users can access the lab."
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
                          onChange={(event) => toggleUsageWindowDay(index, event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                        />
                        <span className="text-sm font-medium text-gray-900">{day}</span>
                      </label>

                      {existing && (
                        <div className="flex flex-1 flex-wrap items-center gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              value={existing.window_start_time}
                              onChange={(event) =>
                                updateUsageWindowDay(index, {
                                  window_start_time: event.target.value,
                                })
                              }
                              className={timeInputClass}
                              aria-label={`${day} start time`}
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                              type="time"
                              value={existing.window_end_time}
                              onChange={(event) =>
                                updateUsageWindowDay(index, {
                                  window_end_time: event.target.value,
                                })
                              }
                              className={timeInputClass}
                              aria-label={`${day} end time`}
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
                              onChange={(event) =>
                                updateUsageWindowDay(index, {
                                  daily_limit_hours: event.target.value
                                    ? parseFloat(event.target.value)
                                    : undefined,
                                })
                              }
                              className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-1 focus:ring-[var(--cloud-accent,#B91C1C)]"
                            />
                          </div>
                        </div>
                      )}
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
                onChange={(event) => {
                  const timezone = event.target.value;
                  onUsageWindowTimezoneChange(timezone);
                  onUsageWindowsChange(usageWindows.map((window) => ({ ...window, timezone })));
                }}
              >
                <option value="Asia/Kolkata">IST — Asia/Kolkata</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">EST — America/New_York</option>
                <option value="America/Los_Angeles">PST — America/Los_Angeles</option>
                <option value="Europe/London">GMT — Europe/London</option>
                <option value="Asia/Dubai">GST — Asia/Dubai</option>
                {COMMON_TIMEZONES.filter(
                  (tz) =>
                    ![
                      'Asia/Kolkata',
                      'UTC',
                      'America/New_York',
                      'America/Los_Angeles',
                      'Europe/London',
                      'Asia/Dubai',
                    ].includes(tz)
                ).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {detailsComplete && isTestIds && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Daily usage windows"
              description="Disabled for Azure test_ids."
            />
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Daily limit time is turned off for test IDs. Users can access the lab for the full
              24-hour window.
            </div>
          </div>
        </section>
      )}

      {detailsComplete && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Resource cleanup"
              description="Automatically clean up lab resources once per day at a time you choose."
            />

            <label className="mt-5 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={resourceCleanupEnabled}
                onChange={(event) => {
                  onResourceCleanupEnabledChange(event.target.checked);
                  if (!event.target.checked) {
                    onResourceCleanupTimeChange('');
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
              />
              <span className="text-sm font-medium text-gray-900">
                Enable daily resource cleanup
              </span>
            </label>

            {resourceCleanupEnabled && (
              <div className="mt-4 space-y-4">
                {pauseCleanupAvailable && (
                  <div>
                    <p className={labelClass}>Cleanup action</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label
                        className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                          resourceCleanupAction === 'delete'
                            ? 'border-red-300 bg-red-50 ring-1 ring-red-200'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="resourceCleanupAction"
                          value="delete"
                          checked={resourceCleanupAction === 'delete'}
                          onChange={() => onResourceCleanupActionChange('delete')}
                          className="mt-0.5 h-4 w-4 border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            Delete resources
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            Permanently remove all Azure resources in the lab.
                          </span>
                        </span>
                      </label>
                      <label
                        className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                          resourceCleanupAction === 'pause'
                            ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="resourceCleanupAction"
                          value="pause"
                          checked={resourceCleanupAction === 'pause'}
                          onChange={() => onResourceCleanupActionChange('pause')}
                          className="mt-0.5 h-4 w-4 border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            Pause resources
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            Stop billable compute without deleting.
                          </span>
                        </span>
                      </label>
                    </div>
                    {selectedPauseCleanupServices.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs text-gray-500">
                        {selectedPauseCleanupServices.map((key) => (
                          <li key={key}>
                            •{' '}
                            {resourceCleanupAction === 'pause'
                              ? PAUSE_CLEANUP_ACTION_LABELS[key]
                              : DELETE_CLEANUP_ACTION_LABELS[key]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div>
                  <label className={labelClass} htmlFor="resourceCleanupTime">
                    {effectiveCleanupAction === 'pause'
                      ? 'Pause resources inside lab daily at'
                      : 'Delete all resources inside lab daily at'}
                  </label>
                  <input
                    id="resourceCleanupTime"
                    type="time"
                    className={inputClass}
                    value={resourceCleanupTime}
                    onChange={(event) => onResourceCleanupTimeChange(event.target.value)}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    {isTestIds
                      ? 'Choose when lab resources are cleaned up each day.'
                      : `Runs daily at this time in ${usageWindowTimezone.replace(/_/g, ' ')}.`}
                  </p>
                </div>

                {isTestIds && (
                  <div>
                    <label className={labelClass} htmlFor="resourceCleanupTimezone">
                      Cleanup timezone
                    </label>
                    <select
                      id="resourceCleanupTimezone"
                      className={inputClass}
                      value={usageWindowTimezone}
                      onChange={(event) => onUsageWindowTimezoneChange(event.target.value)}
                    >
                      <option value="Asia/Kolkata">IST — Asia/Kolkata</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">EST — America/New_York</option>
                      <option value="America/Los_Angeles">PST — America/Los_Angeles</option>
                      <option value="Europe/London">GMT — Europe/London</option>
                      <option value="Asia/Dubai">GST — Asia/Dubai</option>
                      {COMMON_TIMEZONES.filter(
                        (tz) =>
                          ![
                            'Asia/Kolkata',
                            'UTC',
                            'America/New_York',
                            'America/Los_Angeles',
                            'Europe/London',
                            'Asia/Dubai',
                          ].includes(tz)
                      ).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {detailsComplete && !labsMode && (costingMode === 'per_user' || isTestIds) && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Per-user budget"
              description={
                isTestIds
                  ? 'Default $10 spending cap for Azure test_ids.'
                  : 'Optional spending cap per lab user.'
              }
            />

            <div className="mt-5">
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
                  onPerUserBudgetUsdChange(value ? Number.parseFloat(value) : undefined);
                }}
              />
              <p className="mt-2 text-xs text-gray-500">
                {isTestIds
                  ? 'Fixed at $10 for Azure test_ids. When spending exceeds this amount, the user is notified and suspended.'
                  : 'An Azure budget is created for each user with their own resource group.'}
              </p>
            </div>
          </div>
        </section>
      )}

      {showServices && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title={labsMode ? 'Azure Labs' : 'Azure services'}
              description={
                purchaseConvertMode
                  ? 'Copied from your test lab — these services stay locked for purchase.'
                  : labsMode
                    ? 'Search or filter, then select the labs to provision for this request.'
                    : 'Search or filter, then tap to add.'
              }
            />

            <div className="mt-5 space-y-4">
              {!purchaseConvertMode ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={serviceSearch}
                        onChange={(event) => setServiceSearch(event.target.value)}
                        placeholder={labsMode ? 'Search labs…' : 'Search services…'}
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                    <p className="shrink-0 text-xs text-gray-500 sm:text-right">
                      {selectedServiceIds.length} selected
                      {filteredServiceCount !== servicesForPicker.length
                        ? ` · ${filteredServiceCount} shown`
                        : ` · ${servicesForPicker.length} available`}
                    </p>
                  </div>

                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {serviceCategories.map((category) => {
                      const active = serviceCategory === category;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setServiceCategory(category)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent,#B91C1C)] text-white'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Showing {selectedServiceIds.length} service
                  {selectedServiceIds.length === 1 ? '' : 's'} from your test lab.
                </p>
              )}

              {selectedServices.length > 0 && !purchaseConvertMode ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Selected
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedServices.map((service) => {
                      const serviceId = normalizeServiceId(service.id);
                      return (
                        <span
                          key={serviceId}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--cloud-accent,#B91C1C)]/20 bg-[var(--cloud-accent-soft,#fef2f2)] px-2.5 py-1 text-xs font-medium text-gray-800"
                        >
                          <span className="truncate">{serviceDisplayName(service)}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${serviceDisplayName(service)}`}
                            onClick={() => onToggleService(serviceId)}
                            className="rounded-full p-0.5 text-gray-500 transition hover:bg-white hover:text-gray-800"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div
                className={`${
                  purchaseConvertMode ? '' : 'max-h-[28rem] overflow-y-auto'
                } space-y-4 rounded-lg border border-gray-100 p-2 pr-1`}
              >
                {filteredServiceCount === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <p className="text-sm font-medium text-gray-700">
                      {purchaseConvertMode ? 'No services from this test lab' : 'No services match'}
                    </p>
                    {!purchaseConvertMode ? (
                      <>
                        <p className="mt-1 text-xs text-gray-500">
                          Try another search or category filter.
                        </p>
                        {serviceSearch || serviceCategory !== 'All' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setServiceSearch('');
                              setServiceCategory('All');
                            }}
                            className="mt-3 text-xs font-semibold text-[var(--cloud-accent,#B91C1C)] hover:underline"
                          >
                            Clear filters
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : (
                  Array.from(filteredServicesByCategory.entries()).map(([category, services]) => (
                    <div key={category}>
                      {!purchaseConvertMode && serviceCategory === 'All' ? (
                        <div className="mb-2 flex items-center gap-2 px-1">
                          <span className="h-px flex-1 bg-gray-100" />
                          <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                            {category}
                          </p>
                          <span className="h-px flex-1 bg-gray-100" />
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {services.map((service) => {
                          const serviceId = normalizeServiceId(service.id);
                          const checked = selectedServiceIds.includes(serviceId);
                          return (
                            <ServiceOptionCard
                              key={serviceId}
                              service={service}
                              checked={checked}
                              disabled={purchaseConvertMode}
                              onToggle={() => {
                                if (purchaseConvertMode) return;
                                onToggleService(serviceId);
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {showInstances && instanceServices.length > 0 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Instance sizes"
              description={
                purchaseConvertMode
                  ? 'Copied from your test lab — these tiers stay locked for purchase.'
                  : labsMode
                    ? 'Search or pick a tier for each selected lab that supports sizing.'
                    : 'Search or pick a tier for each service that supports sizing.'
              }
            />
            {purchaseConvertMode ? (
              <p className="mt-3 text-xs text-gray-500">
                Showing only the instance tiers from your test lab.
              </p>
            ) : null}
            <div className="mt-5 space-y-4">
              {instanceServices.map((service) => {
                const serviceId = normalizeServiceId(service.id);
                const allOptions = catalogInstances.filter(
                  (instance: CatalogInstance) =>
                    normalizeServiceId(instance.serviceId) === serviceId
                );
                const selected = selectedInstances.find(
                  (entry) => entry.serviceId === serviceId
                )?.instanceOption;
                const options =
                  purchaseConvertMode && selected
                    ? allOptions.filter((instance) => instance.option_name === selected)
                    : allOptions;
                const query = (instanceSearchByService[serviceId] || '').trim().toLowerCase();
                const filteredOptions = query
                  ? options.filter((instance) => {
                      const parsed = parseInstanceGuide(instance.guide, instance.option_name);
                      const haystack = [
                        instance.option_name,
                        parsed.tier,
                        parsed.summary,
                        parsed.description,
                        ...parsed.specs.map((spec) => `${spec.label} ${spec.value}`),
                      ]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                      return haystack.includes(query);
                    })
                  : options;

                return (
                  <div
                    key={serviceId}
                    className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-white/70 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {service.service_name || service.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {selected
                            ? `Selected · ${selected}`
                            : `${options.length} tier${options.length === 1 ? '' : 's'} available`}
                        </p>
                      </div>
                      {selected ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--cloud-accent,#B91C1C)]/20 bg-[var(--cloud-accent-soft,#fef2f2)] px-2.5 py-1 text-xs font-medium text-gray-800">
                          <span className="truncate">{selected}</span>
                          {!purchaseConvertMode ? (
                            <button
                              type="button"
                              aria-label={`Clear ${selected}`}
                              onClick={() => onSelectInstance(serviceId, '')}
                              className="rounded-full p-0.5 text-gray-500 transition hover:bg-white hover:text-gray-800"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Select one tier</span>
                      )}
                    </div>

                    <div className="space-y-3 p-3">
                      {options.length > 4 && !purchaseConvertMode ? (
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                          <input
                            type="search"
                            value={instanceSearchByService[serviceId] || ''}
                            onChange={(event) =>
                              setInstanceSearchByService((prev) => ({
                                ...prev,
                                [serviceId]: event.target.value,
                              }))
                            }
                            placeholder={`Search ${service.service_name || service.name} tiers…`}
                            className={`${inputClass} py-2 pl-9 text-xs`}
                          />
                        </div>
                      ) : null}

                      {options.length === 0 ? (
                        <p className="px-1 py-4 text-center text-sm text-gray-400">
                          No instance options in the catalog.
                        </p>
                      ) : filteredOptions.length === 0 ? (
                        <div className="px-1 py-6 text-center">
                          <p className="text-sm font-medium text-gray-700">No tiers match</p>
                          <button
                            type="button"
                            onClick={() =>
                              setInstanceSearchByService((prev) => ({
                                ...prev,
                                [serviceId]: '',
                              }))
                            }
                            className="mt-2 text-xs font-semibold text-[var(--cloud-accent,#B91C1C)] hover:underline"
                          >
                            Clear search
                          </button>
                        </div>
                      ) : (
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-0.5 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-2 sm:space-y-0">
                          {filteredOptions.map((instance) => (
                            <InstanceOptionCard
                              key={instance.option_name}
                              instance={instance}
                              selected={selected === instance.option_name}
                              disabled={purchaseConvertMode}
                              onSelect={() => {
                                if (purchaseConvertMode) return;
                                onSelectInstance(serviceId, instance.option_name);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {showPermissions && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Permissions"
              description={
                orgAdminCustomRoles.length > 0 || orgAdminCustomServices.length > 0
                  ? 'Catalog roles plus custom roles and services assigned in Lab Management (org-admin).'
                  : labsMode
                    ? 'Roles are assigned automatically from lab catalog rules and instance tiers.'
                    : 'Roles are assigned automatically from catalog rules and instance tiers.'
              }
            />

            {resolvedRoles.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {labsMode ? 'Lab roles' : 'Catalog service roles'}
                </p>
                {resolvedRoles.map((entry) => {
                  const service = catalog.services.find((svc) => svc.id === entry.serviceId);
                  const isAutomated = tierAutomatedServices.has(entry.serviceId);
                  return (
                    <div
                      key={entry.serviceId}
                      className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {service?.service_name || service?.name || entry.serviceId}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {entry.roles.map((role) => (
                          <span
                            key={role}
                            className="rounded-full border border-[var(--cloud-accent,#B91C1C)]/30 bg-[var(--cloud-accent-soft,#fef2f2)] px-3 py-1 text-xs font-medium text-[var(--cloud-accent,#B91C1C)]"
                          >
                            {role}
                            {isAutomated ? ' (auto)' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {orgAdminCustomRoles.length > 0 ? (
              <div className="mt-5 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Custom roles (Lab Management)
                </p>
                {orgAdminCustomRoles.map((role, index) => (
                  <div
                    key={`${role.id ?? role.name}-${index}`}
                    className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-gray-900">{role.name}</p>
                    {role.description ? (
                      <p className="mt-0.5 text-xs text-gray-500">{role.description}</p>
                    ) : null}
                    {role.permissions.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {role.permissions.map((permission) => (
                          <span
                            key={permission}
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
                          >
                            {permission}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400">Assigned on the source test lab</p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {orgAdminCustomServices.length > 0 ? (
              <div className="mt-5 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Custom services (Lab Management)
                </p>
                {orgAdminCustomServices.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-gray-900">{service.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[service.category, service.description].filter(Boolean).join(' · ') ||
                        'Custom service from Lab Management'}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedServices.some(
              (service) =>
                service.enable_role_selection !== false &&
                !tierAutomatedServices.has(service.id)
            ) && (
              <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500">
                  Override roles for services without tier automation
                </p>
                {selectedServices
                  .filter(
                    (service) =>
                      service.enable_role_selection !== false &&
                      !tierAutomatedServices.has(service.id)
                  )
                  .map((service) => {
                    const roles = getRolesForService(catalog, service.id);
                    const selected = manualRoles[service.id] ?? [];

                    return (
                      <div key={service.id}>
                        <p className="mb-2 text-sm font-medium text-gray-900">
                          {service.service_name || service.name}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {roles.map((role) => {
                            const active = selected.includes(role);
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? selected.filter((entry) => entry !== role)
                                    : [...selected, role];
                                  onRoleChange(service.id, next);
                                }}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  active
                                    ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {role}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>
      )}

      {showLicense && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Microsoft license"
              description="Optional — assign a Microsoft license from your tenant to every lab account created for this request."
            />

            {licensesError ? (
              <div className="mt-4 space-y-1">
                <p className="text-sm text-red-600">{licensesError}</p>
                <p className="text-xs text-red-500/90">
                  Required Graph app permissions (admin consent): Directory.Read.All and
                  User.ReadWrite.All or LicenseAssignment.ReadWrite.All.
                </p>
              </div>
            ) : null}

            <div className="relative mt-5">
              <select
                className={`${inputClass} appearance-none pr-10`}
                value={selectedLicenseSkuId}
                onChange={(event) => onSelectedLicenseSkuIdChange(event.target.value)}
                disabled={licensesLoading || Boolean(licensesError)}
              >
                <option value="">
                  {licensesLoading
                    ? 'Loading licenses…'
                    : licenses.length === 0
                      ? 'No licenses available in tenant'
                      : 'No license (optional)'}
                </option>
                {licenses.map((license) => (
                  <option key={license.skuId} value={license.skuId}>
                    {license.productName || license.skuPartNumber}
                  </option>
                ))}
                {selectedLicenseSkuId &&
                !licenses.some((license) => license.skuId === selectedLicenseSkuId) ? (
                  <option value={selectedLicenseSkuId}>
                    License from test lab
                  </option>
                ) : null}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            {!licensesLoading && !licensesError && licenses.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">
                No subscribed SKUs were returned for this tenant. You can continue without assigning
                a license.
              </p>
            ) : null}
          </div>
        </section>
      )}

      {showEmail && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Customer email"
              description="Credentials and lab access details will be sent to this address."
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
                onChange={(event) => onCustomerEmailChange(event.target.value)}
                placeholder="customer@company.com"
              />
            </div>
          </div>
        </section>
      )}

      {showLocations && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={step++}
              title="Deployment region"
              description="Cheapest available region is selected by default. Change only if you need a different location."
            />
            {locationsError && <p className="mt-3 text-sm text-red-600">{locationsError}</p>}
            {!locationsLoading && !locationsError && locations.length === 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No Azure regions support the selected instance option(s). Choose a different tier or
                service configuration.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Selected region
                    </p>
                    {locationsLoading ? (
                      <p className="mt-1 text-sm text-gray-500">Loading cheapest region…</p>
                    ) : selectedLocationEntry ? (
                      <>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-900">
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
                              ? 'Auto-selected cheapest region'
                              : 'Selected for your services'}
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
                        onLocationChange(event.target.value);
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
            {location && selectedLocationEntry && selectedVmPortalTips.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      Azure Portal region: {selectedLocationEntry.display_location} (
                      {selectedLocationEntry.arm_region_name})
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs text-amber-900">
                      {selectedVmPortalTips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {detailsComplete && !labsMode && (
        <section className={sectionClass}>
          <div className="p-6">
            <button
              type="button"
              onClick={() => onAdminAccessOpenChange(!adminAccessOpen)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-gray-900">
                    Request elevated access
                  </span>
                  <span className="text-xs text-gray-500">Optional admin role request</span>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition ${adminAccessOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {adminAccessOpen && (
              <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                <div>
                  <label className={labelClass} htmlFor="adminAccessService">
                    Service
                  </label>
                  <select
                    id="adminAccessService"
                    className={inputClass}
                    value={adminAccessServiceId ?? ''}
                    onChange={(event) =>
                      onAdminAccessServiceIdChange(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">Select a service</option>
                    {catalog.services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.service_name || service.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="adminAccessText">
                    Requested access
                  </label>
                  <textarea
                    id="adminAccessText"
                    rows={3}
                    className={inputClass}
                    value={adminAccessText}
                    onChange={(event) => onAdminAccessTextChange(event.target.value)}
                    placeholder="Need User Access Administrator for RBAC management"
                  />
                </div>
                <button
                  type="button"
                  onClick={onSubmitAdminAccess}
                  disabled={adminAccessSubmitting}
                  className={RACKO_BTN_SECONDARY}
                >
                  {adminAccessSubmitting ? 'Submitting…' : 'Submit access request'}
                </button>
                {adminAccessMessage && (
                  <p className="text-sm text-gray-600">{adminAccessMessage}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {detailsComplete && (
        <section className={sectionClass}>
          <div className="p-6">
            <button
              type="button"
              onClick={() => onPrivilegedRoleOpenChange(!privilegedRoleOpen)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-sm font-semibold text-gray-900">
                    Request privileged roles
                  </span>
                  <span className="text-xs text-gray-500">
                    Built-in Azure roles (Owner excluded) — sent to Lab Management for approval
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition ${privilegedRoleOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {privilegedRoleOpen && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="space-y-4 rounded-xl border border-violet-200/80 bg-violet-50/40 p-5">
                  <div>
                    <label className={labelClass} htmlFor="privilegedRoleSelect">
                      Privileged role
                    </label>
                    <select
                      id="privilegedRoleSelect"
                      className={inputClass}
                      value={selectedPrivilegedRole}
                      onChange={(event) => onSelectedPrivilegedRoleChange(event.target.value)}
                      disabled={privilegedRolesLoading}
                    >
                      <option value="">
                        {privilegedRolesLoading ? 'Loading roles…' : 'Select a role'}
                      </option>
                      {privilegedRoles.map((role) => (
                        <option key={role.definitionId} value={role.name}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-gray-600">
                      Owner is excluded. Org admin must approve before the role is assigned to all
                      lab users.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {privilegedRoleSubmitted ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white sm:w-auto"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Request sent
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onSubmitPrivilegedRoleRequest}
                        disabled={privilegedRoleSubmitting || !selectedPrivilegedRole}
                        className={`${RACKO_BTN_PRIMARY} w-full sm:w-auto sm:min-w-[148px]`}
                      >
                        {privilegedRoleSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          'Submit request'
                        )}
                      </button>
                    )}

                    {privilegedRoleSubmitted ? (
                      <span className="text-xs font-medium text-green-700">
                        Pending org-admin approval
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">
                        Sent to Lab Management for approval
                      </span>
                    )}
                  </div>

                  {privilegedRoleSubmitted && privilegedRoleMessage ? (
                    <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                      <div>
                        <p className="text-sm font-semibold text-green-900">
                          Privileged role request submitted
                        </p>
                        <p className="mt-1 text-sm text-green-800">{privilegedRoleMessage}</p>
                        <p className="mt-2 text-xs text-green-700">
                          Change the role above to submit another request.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {!privilegedRoleSubmitted &&
                  privilegedRoleMessage &&
                  privilegedRoleMessageType === 'error' ? (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                      <p className="text-sm text-red-800">{privilegedRoleMessage}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
