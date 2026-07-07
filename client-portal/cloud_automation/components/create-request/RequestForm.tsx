'use client';

import { AlertCircle, ChevronDown, Shield } from 'lucide-react';
import { COMMON_TIMEZONES } from '../../constants';
import type {
  AvailableLocation,
  CatalogInstance,
  CatalogService,
  SelectedRole,
  ServiceCatalogResponse,
  SelectedInstance,
  UsageWindow,
  CostingMode,
} from '../../types/catalog';
import {
  catalogInstancesForServices,
  formatInstanceGuide,
  getSelectedPauseCleanupServices,
  isCustomerDetailsComplete,
  normalizeServiceId,
  DELETE_CLEANUP_ACTION_LABELS,
  PAUSE_CLEANUP_ACTION_LABELS,
  supportsPauseCleanup,
} from '../../utils/requestForm';
import { formatCatalogServicePrice } from '../../utils/formatters';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';

const timeInputClass =
  'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';

const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500';

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
  resourceCleanupIntervalHours?: number;
  onResourceCleanupIntervalHoursChange: (value: number | undefined) => void;
  resourceCleanupAction: 'delete' | 'pause';
  onResourceCleanupActionChange: (value: 'delete' | 'pause') => void;
  perUserBudgetUsd?: number;
  onPerUserBudgetUsdChange: (value: number | undefined) => void;
  adminAccessOpen: boolean;
  onAdminAccessOpenChange: (value: boolean) => void;
  adminAccessServiceId: number | null;
  onAdminAccessServiceIdChange: (value: number | null) => void;
  adminAccessText: string;
  onAdminAccessTextChange: (value: string) => void;
  onSubmitAdminAccess: () => void;
  adminAccessSubmitting: boolean;
  adminAccessMessage: string | null;
  validationErrors: string[];
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
  resourceCleanupIntervalHours,
  onResourceCleanupIntervalHoursChange,
  resourceCleanupAction,
  onResourceCleanupActionChange,
  perUserBudgetUsd,
  onPerUserBudgetUsdChange,
  adminAccessOpen,
  onAdminAccessOpenChange,
  adminAccessServiceId,
  onAdminAccessServiceIdChange,
  adminAccessText,
  onAdminAccessTextChange,
  onSubmitAdminAccess,
  adminAccessSubmitting,
  adminAccessMessage,
  validationErrors,
}: RequestFormProps) {
  const servicesByCategory = groupServicesByCategory(catalog.services);
  const selectedServices = catalog.services.filter((service) =>
    selectedServiceIds.includes(normalizeServiceId(service.id))
  );
  const instanceServices = selectedServices.filter((service) => service.supports_instances);
  const catalogInstances = catalogInstancesForServices(catalog.instances, selectedServiceIds);

  const detailsComplete = isCustomerDetailsComplete({
    customerEmail,
    accountCount,
    startDate,
    endDate,
  });
  const pauseCleanupAvailable = supportsPauseCleanup(catalog, selectedServiceIds);
  const selectedPauseCleanupServices = getSelectedPauseCleanupServices(catalog, selectedServiceIds);
  const effectiveCleanupAction = pauseCleanupAvailable ? resourceCleanupAction : 'delete';
  const showServices = detailsComplete;
  const showInstances = showServices && selectedServiceIds.length > 0;
  const showPermissions =
    showInstances && instancesComplete(catalog, selectedServiceIds, selectedInstances);
  const showLocations =
    showPermissions && rolesComplete(catalog, selectedServiceIds, resolvedRoles);

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

  return (
    <div className="space-y-6">
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <ul className="space-y-1 text-sm text-red-700">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Step 1: Customer details */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Customer details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="customerEmail">
              Customer email
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
          <div>
            <label className={labelClass} htmlFor="accountCount">
              Account count
            </label>
            <input
              id="accountCount"
              type="number"
              min={1}
              className={inputClass}
              value={accountCount}
              onChange={(event) => onAccountCountChange(Number(event.target.value))}
            />
          </div>
          <div className="sm:col-span-2">
            <span className={labelClass}>Resource group costing</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[#B91C1C] has-[:checked]:bg-red-50/40">
                <input
                  type="radio"
                  name="costingMode"
                  value="shared"
                  checked={costingMode === 'shared'}
                  onChange={() => onCostingModeChange('shared')}
                  className="mt-1 h-4 w-4 border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Shared resource group</span>
                  <span className="mt-1 block text-xs text-gray-500">
                    One resource group for all users. Best for shared labs and total request costing.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[#B91C1C] has-[:checked]:bg-red-50/40">
                <input
                  type="radio"
                  name="costingMode"
                  value="per_user"
                  checked={costingMode === 'per_user'}
                  onChange={() => onCostingModeChange('per_user')}
                  className="mt-1 h-4 w-4 border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
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
              className={inputClass}
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </div>
        </div>
      </section>

      {detailsComplete && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Daily usage windows</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Set which days and hours lab users can access Azure
          </p>

          <div className="mt-4 space-y-3">
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
                        className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
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
                              updateUsageWindowDay(index, { window_start_time: event.target.value })
                            }
                            className={timeInputClass}
                            aria-label={`${day} start time`}
                          />
                          <span className="text-xs text-gray-400">to</span>
                          <input
                            type="time"
                            value={existing.window_end_time}
                            onChange={(event) =>
                              updateUsageWindowDay(index, { window_end_time: event.target.value })
                            }
                            className={timeInputClass}
                            aria-label={`${day} end time`}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs font-medium text-gray-500" htmlFor={`daily-limit-${index}`}>
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
                            className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                          />
                          {existing.daily_limit_hours ? (
                            <span className="text-xs text-gray-400">
                              Users blocked + resources deleted after {existing.daily_limit_hours}h of usage
                            </span>
                          ) : null}
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
                onUsageWindowsChange(
                  usageWindows.map((window) => ({ ...window, timezone }))
                );
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
        </section>
      )}

      {detailsComplete && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={resourceCleanupEnabled}
              onChange={(event) => {
                onResourceCleanupEnabledChange(event.target.checked);
                if (!event.target.checked) {
                  onResourceCleanupIntervalHoursChange(undefined);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            <span className="text-sm font-medium text-gray-900">Enable periodic resource cleanup</span>
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
                        className="mt-0.5 h-4 w-4 border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">Delete resources</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          Permanently remove all Azure resources in the lab. Users start fresh and
                          recreate resources from scratch.
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
                        className="mt-0.5 h-4 w-4 border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">Pause resources</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          Stop billable compute without deleting. Lab accounts stay active and users
                          can resume or recreate resources later.
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
              <label className={labelClass} htmlFor="resourceCleanupIntervalHours">
                {effectiveCleanupAction === 'pause'
                  ? 'Pause resources inside lab every (hours)'
                  : 'Delete all resources inside lab every (hours)'}
              </label>
              <input
                id="resourceCleanupIntervalHours"
                type="number"
                min={1}
                max={24}
                placeholder="e.g. 1"
                className={inputClass}
                value={resourceCleanupIntervalHours ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  onResourceCleanupIntervalHoursChange(
                    value ? Number.parseInt(value, 10) : undefined
                  );
                }}
              />
              <p className="mt-2 text-xs text-gray-500">
                {effectiveCleanupAction === 'pause' ? (
                  <>
                    Every {resourceCleanupIntervalHours || '?'} hour(s), selected compute services
                    will be paused or stopped instead of deleted. Lab accounts and access are kept
                    — users can resume or recreate resources after cleanup.
                  </>
                ) : (
                  <>
                    Every {resourceCleanupIntervalHours || '?'} hour(s), all Azure resources (VMs,
                    databases, disks, etc.) created inside the lab will be automatically deleted. Lab
                    accounts and access are kept — users can create new resources again immediately
                    after cleanup.
                  </>
                )}
              </p>
              </div>
            </div>
          )}
        </section>
      )}

      {detailsComplete && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Per-user budget</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Optional spending cap per user (requires per-user resource groups)
          </p>

          <div className="mt-4">
            <label className={labelClass} htmlFor="perUserBudgetUsd">
              Budget per user (USD) — optional
            </label>
            <input
              id="perUserBudgetUsd"
              type="number"
              min={1}
              step={0.01}
              placeholder="e.g. 50.00"
              className={inputClass}
              value={perUserBudgetUsd ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                onPerUserBudgetUsdChange(value ? Number.parseFloat(value) : undefined);
              }}
            />
            <p className="mt-2 text-xs text-gray-500">
              An Azure budget is created for each user with their own resource group. When spending
              exceeds this amount, the user receives an email and their account is automatically suspended.
            </p>
          </div>
        </section>
      )}

      {/* Step 3: Service selection */}
      {showServices && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Services</h2>
          <p className="mt-0.5 text-xs text-gray-400">Select one or more Azure services to provision</p>
          <div className="mt-4 space-y-5">
            {Array.from(servicesByCategory.entries()).map(([category, services]) => (
              <div key={category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {category}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {services.map((service) => {
                    const serviceId = normalizeServiceId(service.id);
                    const checked = selectedServiceIds.includes(serviceId);
                    const servicePrice = formatCatalogServicePrice(service);
                    return (
                      <label
                        key={serviceId}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                          checked
                            ? 'border-[#B91C1C] bg-red-50/50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleService(serviceId)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {service.service_name || service.name}
                            </span>
                            {servicePrice && (
                              <span className="shrink-0 text-xs font-medium text-gray-600">
                                {servicePrice}
                              </span>
                            )}
                          </span>
                          {service.supports_instances && (
                            <span className="mt-0.5 block text-xs text-gray-400">
                              Instance selection required
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 4: Instance sizes (from catalog) */}
      {showInstances && instanceServices.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Instance sizes</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Choose instance tiers for services that support sizing
          </p>
          <div className="mt-4 space-y-5">
            {instanceServices.map((service) => {
              const serviceId = normalizeServiceId(service.id);
              const options = catalogInstances.filter(
                (instance: CatalogInstance) =>
                  normalizeServiceId(instance.serviceId) === serviceId
              );
              const selected = selectedInstances.find(
                (entry) => entry.serviceId === serviceId
              )?.instanceOption;

              return (
                <div key={serviceId}>
                  <p className="mb-2 text-sm font-medium text-gray-900">
                    {service.service_name || service.name}
                  </p>
                  {options.length === 0 ? (
                    <p className="text-sm text-gray-400">No instance options in the catalog.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((instance) => {
                        const price =
                          instance.hourlyPrice ??
                          instance.hourly_price ??
                          (instance.dailyPrice ?? instance.daily_price) != null
                            ? Number(instance.dailyPrice ?? instance.daily_price) / 24
                            : null;
                        const active = selected === instance.option_name;
                        const guideText = formatInstanceGuide(instance.guide);
                        return (
                          <button
                            key={instance.option_name}
                            type="button"
                            onClick={() => onSelectInstance(serviceId, instance.option_name)}
                            className={`rounded-lg border p-3 text-left transition ${
                              active
                                ? 'border-[#B91C1C] bg-red-50/50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <span className="block text-sm font-medium text-gray-900">
                              {instance.option_name}
                            </span>
                            {guideText && (
                              <span className="mt-0.5 block text-xs text-gray-500">{guideText}</span>
                            )}
                            {price != null && (
                              <span className="mt-1 block text-xs text-gray-400">
                                ${Number(price).toFixed(3)}/hr
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 5: Permissions (auto + manual) */}
      {showPermissions && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Permissions</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Roles are auto-assigned from catalog rules and instance tier mappings
          </p>

          {resolvedRoles.length > 0 && (
            <div className="mt-4 space-y-3">
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
                          className="rounded-full border border-[#B91C1C] bg-red-50 px-3 py-1 text-xs font-medium text-[#B91C1C]"
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

          {selectedServices.some(
            (service) =>
              service.enable_role_selection !== false &&
              !tierAutomatedServices.has(service.id)
          ) && (
            <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500">Override roles for services without tier automation</p>
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
                                  ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
        </section>
      )}

      {/* Step 6: Region (derived from services + instances) */}
      {showLocations && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Region</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Available regions based on your service and instance selections
          </p>
          {locationsError && (
            <p className="mt-2 text-sm text-red-600">{locationsError}</p>
          )}
          <div className="relative mt-4">
            <select
              className={`${inputClass} appearance-none pr-10`}
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              disabled={locationsLoading}
            >
              <option value="">
                {locationsLoading ? 'Loading regions…' : 'Select a region'}
              </option>
              {locations.map((entry) => (
                <option key={entry.arm_region_name} value={entry.arm_region_name}>
                  {entry.display_location}
                  {entry.basePrice != null ? ` — from $${entry.basePrice.toFixed(3)}/hr` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </section>
      )}

      {/* Admin access request */}
      {detailsComplete && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => onAdminAccessOpenChange(!adminAccessOpen)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#B91C1C]" />
              <span className="text-sm font-semibold text-gray-900">Request elevated access</span>
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
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {adminAccessSubmitting ? 'Submitting…' : 'Submit access request'}
              </button>
              {adminAccessMessage && (
                <p className="text-sm text-gray-600">{adminAccessMessage}</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
