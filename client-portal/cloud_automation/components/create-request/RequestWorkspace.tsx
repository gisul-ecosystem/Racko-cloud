'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Cloud, FilePlus2 } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ApiError } from '../../../lib/apiClient';
import {
  chargeAdminWalletForCloudRequest,
  getMyAdminWallet,
  linkAdminWalletCloudCharge,
  refundAdminWalletCloudCharge,
} from '../../../lib/adminBillingApi';
import {
  createAdminAccessRequest,
  createRequestWithPricing,
} from '../../api/client';
import { useAzureRoutes } from '../../../lib/cloudPortalRoutes';
import { useAvailableLocations } from '../../hooks/useAvailableLocations';
import { usePricingEstimate } from '../../hooks/usePricingEstimate';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import type {
  PricingEstimatePayload,
  SelectedInstance,
  SelectedRole,
  ServiceCatalogResponse,
  UsageWindow,
  CostingMode,
} from '../../types/catalog';
import {
  defaultEndDate,
  defaultStartDate,
  normalizeServiceId,
  supportsPauseCleanup,
} from '../../utils/requestForm';
import {
  convertUsdToInr,
  DEFAULT_USD_TO_INR_RATE,
  formatInr,
} from '../../utils/walletBilling';
import { PricingSummary } from './PricingSummary';
import { RequestForm } from './RequestForm';
import { CreateRequestSubmitBar } from './CreateRequestSubmitBar';
import { isCustomerDetailsComplete } from '../../utils/requestForm';

function resolveTierAutomatedServices(
  catalog: ServiceCatalogResponse,
  selectedInstances: SelectedInstance[]
): Set<number> {
  const automated = new Set<number>();
  for (const instance of selectedInstances) {
    const mapping = catalog.instanceRoleMappings.find(
      (entry) =>
        entry.serviceId === instance.serviceId &&
        entry.instanceOption === instance.instanceOption &&
        entry.tierAutomated
    );
    if (mapping) automated.add(instance.serviceId);
  }
  return automated;
}

function resolveAutoAssignRoles(
  catalog: ServiceCatalogResponse,
  serviceId: number
): string[] {
  return catalog.roles
    .filter((entry) => entry.serviceId === serviceId && entry.auto_assign)
    .map((entry) => entry.azure_role);
}

function resolveSelectedRoles(
  catalog: ServiceCatalogResponse,
  serviceIds: number[],
  selectedInstances: SelectedInstance[],
  manualRoles: Record<number, string[]>
): SelectedRole[] {
  return serviceIds
    .map((serviceId) => {
      const instance = selectedInstances.find((entry) => entry.serviceId === serviceId);
      const mapping = catalog.instanceRoleMappings.find(
        (entry) =>
          entry.serviceId === serviceId &&
          entry.instanceOption === instance?.instanceOption &&
          entry.tierAutomated
      );

      const roles = new Set<string>();

      if (mapping?.azureRole) {
        roles.add(mapping.azureRole);
      }

      const manual = manualRoles[serviceId];
      if (manual?.length) {
        for (const role of manual) {
          roles.add(role);
        }
      }

      if (roles.size === 0) {
        const service = catalog.services.find((entry) => entry.id === serviceId);
        const defaultRole = service?.default_role || service?.azure_role;
        if (defaultRole) {
          roles.add(defaultRole);
        }
      }

      for (const autoRole of resolveAutoAssignRoles(catalog, serviceId)) {
        roles.add(autoRole);
      }

      return { serviceId, roles: [...roles] };
    })
    .filter((entry) => entry.roles.length > 0);
}

function validateForm(input: {
  customerEmail: string;
  accountCount: number;
  location: string;
  serviceIds: number[];
  selectedRoles: SelectedRole[];
  selectedInstances: SelectedInstance[];
  catalog: ServiceCatalogResponse;
  startDate: string;
  endDate: string;
  usageWindows: UsageWindow[];
  resourceCleanupEnabled: boolean;
  resourceCleanupIntervalHours?: number;
  resourceCleanupAction?: 'delete' | 'pause';
  perUserBudgetUsd?: number;
}): string[] {
  const errors: string[] = [];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(input.customerEmail.trim())) {
    errors.push('Enter a valid customer email address.');
  }

  if (!Number.isInteger(input.accountCount) || input.accountCount <= 0) {
    errors.push('Account count must be a positive integer.');
  }

  if (input.serviceIds.length === 0) {
    errors.push('Select at least one service.');
  }

  if (!input.location.trim()) {
    errors.push('Select a region.');
  }

  if (!input.startDate || !input.endDate) {
    errors.push('Start and end dates are required.');
  } else if (new Date(input.endDate) < new Date(input.startDate)) {
    errors.push('End date must be on or after start date.');
  }

  for (const serviceId of input.serviceIds) {
    const service = input.catalog.services.find((entry) => entry.id === serviceId);
    if (service?.supports_instances) {
      const hasInstance = input.selectedInstances.some((entry) => entry.serviceId === serviceId);
      if (!hasInstance) {
        errors.push(`Select an instance for ${service.service_name || service.name}.`);
      }
    }
  }

  const servicesRequiringRoles = input.serviceIds.filter((serviceId) => {
    const service = input.catalog.services.find((entry) => entry.id === serviceId);
    return service?.role_required !== false;
  });
  const servicesWithRoles = new Set(input.selectedRoles.map((entry) => entry.serviceId));
  for (const serviceId of servicesRequiringRoles) {
    if (!servicesWithRoles.has(serviceId)) {
      const service = input.catalog.services.find((entry) => entry.id === serviceId);
      errors.push(`Assign at least one role for ${service?.service_name || service?.name || serviceId}.`);
    }
  }

  if (input.usageWindows.length > 0) {
    for (const window of input.usageWindows) {
      if (!window.window_start_time || !window.window_end_time) {
        errors.push('Each enabled usage window must have a start and end time.');
      } else if (window.window_start_time >= window.window_end_time) {
        errors.push('Usage window end time must be after the start time.');
      }
    }
  }

  if (input.resourceCleanupEnabled) {
    if (
      !Number.isInteger(input.resourceCleanupIntervalHours)
      || (input.resourceCleanupIntervalHours ?? 0) < 1
      || (input.resourceCleanupIntervalHours ?? 0) > 24
    ) {
      errors.push('Enter a resource cleanup interval between 1 and 24 hours when enabled.');
    }
  }

  if (input.perUserBudgetUsd !== undefined) {
    if (!Number.isFinite(input.perUserBudgetUsd) || input.perUserBudgetUsd <= 0) {
      errors.push('Budget per user must be a positive number.');
    }
  }

  return errors;
}

export function RequestWorkspace() {
  const router = useRouter();
  const AZURE_ROUTES = useAzureRoutes();
  const { catalog, loading: catalogLoading, error: catalogError, refetch } = useServiceCatalog();

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedInstances, setSelectedInstances] = useState<SelectedInstance[]>([]);
  const [manualRoles, setManualRoles] = useState<Record<number, string[]>>({});
  const [location, setLocation] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [accountCount, setAccountCount] = useState(10);
  const [costingMode, setCostingMode] = useState<CostingMode>('shared');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [usageWindows, setUsageWindows] = useState<UsageWindow[]>([]);
  const [usageWindowTimezone, setUsageWindowTimezone] = useState('Asia/Kolkata');
  const [resourceCleanupEnabled, setResourceCleanupEnabled] = useState(false);
  const [resourceCleanupIntervalHours, setResourceCleanupIntervalHours] = useState<
    number | undefined
  >(undefined);
  const [resourceCleanupAction, setResourceCleanupAction] = useState<'delete' | 'pause'>('delete');
  const [perUserBudgetUsd, setPerUserBudgetUsd] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState('INR');
  const [usdToInrRate, setUsdToInrRate] = useState(DEFAULT_USD_TO_INR_RATE);
  const [walletLoading, setWalletLoading] = useState(true);

  const [adminAccessOpen, setAdminAccessOpen] = useState(false);
  const [adminAccessServiceId, setAdminAccessServiceId] = useState<number | null>(null);
  const [adminAccessText, setAdminAccessText] = useState('');
  const [adminAccessSubmitting, setAdminAccessSubmitting] = useState(false);
  const [adminAccessMessage, setAdminAccessMessage] = useState<string | null>(null);

  const { locations, loading: locationsLoading, error: locationsError } = useAvailableLocations(
    selectedServiceIds,
    selectedInstances
  );

  const refreshWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const wallet = await getMyAdminWallet();
      setWalletBalance(wallet.balance);
      setWalletCurrency(wallet.currency || 'INR');
      if (wallet.usdToInrRate && wallet.usdToInrRate > 0) {
        setUsdToInrRate(wallet.usdToInrRate);
      }
    } catch {
      setWalletBalance(null);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  const tierAutomatedServices = useMemo(
    () => (catalog ? resolveTierAutomatedServices(catalog, selectedInstances) : new Set<number>()),
    [catalog, selectedInstances]
  );

  const selectedRoles = useMemo(
    () =>
      catalog
        ? resolveSelectedRoles(catalog, selectedServiceIds, selectedInstances, manualRoles)
        : [],
    [catalog, selectedServiceIds, selectedInstances, manualRoles]
  );

  const pauseCleanupAvailable = useMemo(
    () => (catalog ? supportsPauseCleanup(catalog, selectedServiceIds) : false),
    [catalog, selectedServiceIds]
  );

  useEffect(() => {
    if (!pauseCleanupAvailable && resourceCleanupAction === 'pause') {
      setResourceCleanupAction('delete');
    }
  }, [pauseCleanupAvailable, resourceCleanupAction]);

  useEffect(() => {
    if (!locations.some((entry) => entry.arm_region_name === location)) {
      setLocation('');
    }
  }, [locations, location]);

  const pricingPayload = useMemo<PricingEstimatePayload | null>(() => {
    if (!catalog || selectedServiceIds.length === 0 || !location) return null;
    return {
      accountCount,
      serviceIds: selectedServiceIds,
      location,
      startDate,
      endDate,
      selectedInstances,
      selectedRoles,
      costingMode,
      usageWindows,
    };
  }, [
    catalog,
    accountCount,
    selectedServiceIds,
    location,
    startDate,
    endDate,
    selectedInstances,
    selectedRoles,
    costingMode,
    usageWindows,
  ]);

  const { pricing, loading: pricingLoading, error: pricingError } = usePricingEstimate(pricingPayload);

  const handleToggleService = useCallback((serviceId: number) => {
    const normalizedId = normalizeServiceId(serviceId);
    if (!normalizedId) return;

    setSelectedServiceIds((current) => {
      if (current.includes(normalizedId)) {
        return current.filter((id) => id !== normalizedId);
      }
      return [...current, normalizedId];
    });
    setSelectedInstances((current) => current.filter((entry) => entry.serviceId !== normalizedId));
    setManualRoles((current) => {
      const next = { ...current };
      delete next[normalizedId];
      return next;
    });
    setLocation('');
  }, []);

  const handleSelectInstance = useCallback((serviceId: number, instanceOption: string) => {
    setSelectedInstances((current) => {
      const without = current.filter((entry) => entry.serviceId !== serviceId);
      return [...without, { serviceId, instanceOption }];
    });
    setLocation('');
  }, []);

  const handleRoleChange = useCallback((serviceId: number, roles: string[]) => {
    setManualRoles((current) => ({ ...current, [serviceId]: roles }));
  }, []);

  const handleSubmit = async () => {
    if (!catalog) return;

    const errors = validateForm({
      customerEmail,
      accountCount,
      location,
      serviceIds: selectedServiceIds,
      selectedRoles,
      selectedInstances,
      catalog,
      startDate,
      endDate,
      usageWindows,
      resourceCleanupEnabled,
      resourceCleanupIntervalHours,
      perUserBudgetUsd,
    });

    setValidationErrors(errors);
    setSubmitError(null);

    if (errors.length > 0) return;

    if (totalPrice == null) {
      setSubmitError('Complete the form to calculate an estimate before creating the request.');
      return;
    }

    const estimatedInr = convertUsdToInr(totalPrice, usdToInrRate) ?? 0;

    if (totalPrice > 0) {
      if (walletBalance == null) {
        setSubmitError('Unable to load your wallet balance. Refresh and try again.');
        return;
      }

      if (walletBalance < estimatedInr) {
        setSubmitError(
          `Insufficient wallet balance. This request needs ${formatInr(estimatedInr)} but your wallet has ${formatInr(walletBalance)}.`
        );
        return;
      }
    }

    setSubmitting(true);
    let chargedInr: number | null = null;

    try {
      if (totalPrice > 0) {
        const charge = await chargeAdminWalletForCloudRequest(totalPrice, null, 'azure');
        chargedInr = charge.chargedInr;
        setWalletBalance(charge.balance);
        setUsdToInrRate(charge.usdToInrRate);
      }

      try {
        const response = await createRequestWithPricing({
          customerEmail: customerEmail.trim(),
          accountCount,
          location,
          startDate,
          endDate,
          serviceIds: selectedServiceIds,
          selectedRoles,
          selectedInstances,
          costingMode,
          resourceCleanupEnabled,
          ...(resourceCleanupEnabled && resourceCleanupIntervalHours
            ? {
                resourceCleanupIntervalHours,
                ...(pauseCleanupAvailable && resourceCleanupAction === 'pause'
                  ? { resourceCleanupAction: 'pause' as const }
                  : {}),
              }
            : {}),
          ...(perUserBudgetUsd !== undefined ? { perUserBudgetUsd } : {}),
          ...(usageWindows.length > 0
            ? {
                usageWindows: usageWindows.map((window) => ({
                  ...window,
                  timezone: usageWindowTimezone,
                })),
              }
            : {}),
        });

        if (chargedInr != null && chargedInr > 0) {
          void linkAdminWalletCloudCharge(String(response.requestId)).catch(() => undefined);
        }
        router.push(AZURE_ROUTES.requestStatus(response.requestId));
      } catch (createErr) {
        if (chargedInr != null && chargedInr > 0) {
          try {
            const refunded = await refundAdminWalletCloudCharge(chargedInr);
            setWalletBalance(refunded.balance);
          } catch {
            // Best-effort refund; surface original create failure below.
          }
        }
        throw createErr;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setSubmitError(
          'Insufficient wallet balance. Top up your wallet, then try creating the request again.'
        );
        void refreshWallet();
      } else {
        setSubmitError(
          err instanceof ApiError ? err.message : 'Failed to create provisioning request.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAdminAccess = async () => {
    if (!catalog || !adminAccessServiceId) {
      setAdminAccessMessage('Select a service for the access request.');
      return;
    }

    const service = catalog.services.find((entry) => entry.id === adminAccessServiceId);
    if (!service) return;

    if (!customerEmail.trim()) {
      setAdminAccessMessage('Enter a customer email first.');
      return;
    }

    if (!adminAccessText.trim()) {
      setAdminAccessMessage('Describe the requested access.');
      return;
    }

    setAdminAccessSubmitting(true);
    setAdminAccessMessage(null);
    try {
      await createAdminAccessRequest({
        customerEmail: customerEmail.trim(),
        serviceId: service.id,
        serviceName: service.service_name || service.name,
        defaultRole: service.default_role || service.azure_role || 'Contributor',
        requestedAccess: adminAccessText.trim(),
        accountCount,
      });
      setAdminAccessMessage('Admin access request submitted successfully.');
      setAdminAccessText('');
    } catch (err) {
      setAdminAccessMessage(
        err instanceof ApiError ? err.message : 'Failed to submit admin access request.'
      );
    } finally {
      setAdminAccessSubmitting(false);
    }
  };

  const totalPrice = pricing?.totalPrice ?? pricing?.estimatedPrice ?? null;
  const estimatedInr = convertUsdToInr(totalPrice, usdToInrRate);
  const insufficientBalance =
    Boolean(totalPrice && totalPrice > 0) &&
    estimatedInr != null &&
    walletBalance != null &&
    walletBalance < estimatedInr;

  const formProgress = useMemo(() => {
    const detailsDone = isCustomerDetailsComplete({
      customerEmail,
      accountCount,
      startDate,
      endDate,
    });
    const servicesDone = selectedServiceIds.length > 0;
    const regionDone = Boolean(location.trim());

    return [
      { label: 'Details', done: detailsDone },
      { label: 'Policies', done: detailsDone },
      { label: 'Services', done: servicesDone },
      { label: 'Region', done: regionDone },
    ];
  }, [customerEmail, accountCount, startDate, endDate, selectedServiceIds, location]);

  const submitBarProps = {
    submitting,
    submitError,
    totalPrice,
    currency: pricing?.currency,
    onSubmit: handleSubmit,
    walletBalance,
    walletCurrency,
    estimatedInr,
    usdToInrRate,
    walletLoading,
    insufficientBalance,
  };

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-10">
      {/* Page header */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-[#B91C1C] via-[#DC2626] to-[#B91C1C]" />
        <div className="p-6 lg:p-8">
          <Link
            href={AZURE_ROUTES.dashboard}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#B91C1C]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] ring-1 ring-[#B91C1C]/10">
                <FilePlus2 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                  Azure automation
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                  Create request
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                  Provision Azure lab access for a customer using the service catalog.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Cloud className="h-4 w-4 shrink-0 text-[#B91C1C]" />
              <span>Fields unlock step by step as you complete each section</span>
            </div>
          </div>
        </div>
      </div>

      {catalogError && !catalogLoading && (
        <ErrorState message={catalogError} onRetry={refetch} />
      )}

      {catalogLoading && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-6">
            <TableSkeleton rows={6} cols={1} embedded />
          </div>
        </div>
      )}

      {catalog && !catalogError && (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                Request progress
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {formProgress.filter((step) => step.done).length} of {formProgress.length} steps
                complete
              </p>
            </div>
            <ol className="grid grid-cols-2 gap-4 px-6 py-5 sm:grid-cols-4">
              {formProgress.map((step, index) => (
                <li key={step.label} className="relative flex items-center gap-3">
                  {index < formProgress.length - 1 ? (
                    <span
                      className="absolute left-4 top-8 hidden h-px w-[calc(100%-1rem)] bg-gray-200 sm:block"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                      step.done
                        ? 'bg-[#B91C1C] text-white shadow-sm'
                        : 'border border-gray-200 bg-white text-gray-400'
                    }`}
                  >
                    {step.done ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span
                    className={`text-sm ${
                      step.done ? 'font-medium text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
            <RequestForm
              catalog={catalog}
              selectedServiceIds={selectedServiceIds}
              onToggleService={handleToggleService}
              location={location}
              onLocationChange={setLocation}
              locations={locations}
              locationsLoading={locationsLoading}
              locationsError={locationsError}
              selectedInstances={selectedInstances}
              onSelectInstance={handleSelectInstance}
              manualRoles={manualRoles}
              onRoleChange={handleRoleChange}
              tierAutomatedServices={tierAutomatedServices}
              resolvedRoles={selectedRoles}
              customerEmail={customerEmail}
              onCustomerEmailChange={setCustomerEmail}
              accountCount={accountCount}
              onAccountCountChange={setAccountCount}
              costingMode={costingMode}
              onCostingModeChange={setCostingMode}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              usageWindows={usageWindows}
              onUsageWindowsChange={setUsageWindows}
              usageWindowTimezone={usageWindowTimezone}
              onUsageWindowTimezoneChange={setUsageWindowTimezone}
              resourceCleanupEnabled={resourceCleanupEnabled}
              onResourceCleanupEnabledChange={setResourceCleanupEnabled}
              resourceCleanupIntervalHours={resourceCleanupIntervalHours}
              onResourceCleanupIntervalHoursChange={setResourceCleanupIntervalHours}
              resourceCleanupAction={resourceCleanupAction}
              onResourceCleanupActionChange={setResourceCleanupAction}
              perUserBudgetUsd={perUserBudgetUsd}
              onPerUserBudgetUsdChange={setPerUserBudgetUsd}
              adminAccessOpen={adminAccessOpen}
              onAdminAccessOpenChange={setAdminAccessOpen}
              adminAccessServiceId={adminAccessServiceId}
              onAdminAccessServiceIdChange={setAdminAccessServiceId}
              adminAccessText={adminAccessText}
              onAdminAccessTextChange={setAdminAccessText}
              onSubmitAdminAccess={handleSubmitAdminAccess}
              adminAccessSubmitting={adminAccessSubmitting}
              adminAccessMessage={adminAccessMessage}
              validationErrors={validationErrors}
            />

            <div className="space-y-4 xl:hidden">
              <PricingSummary
                totalPrice={totalPrice}
                currency={pricing?.currency}
                durationHours={pricing?.durationHours}
                calendarHours={pricing?.calendarHours}
                billableHours={pricing?.billableHours}
                usesUsageWindows={pricing?.usesUsageWindows}
                accountCount={pricing?.accounts ?? accountCount}
                baseHourlyPrice={pricing?.baseHourlyPrice}
                portalHourlyTotal={pricing?.portalHourlyTotal}
                infraHourlyTotal={pricing?.infraHourlyTotal}
                loading={pricingLoading}
                error={pricingError}
              />

              <CreateRequestSubmitBar {...submitBarProps} />
            </div>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-20 space-y-4">
              <PricingSummary
                totalPrice={totalPrice}
                currency={pricing?.currency}
                durationHours={pricing?.durationHours}
                calendarHours={pricing?.calendarHours}
                billableHours={pricing?.billableHours}
                usesUsageWindows={pricing?.usesUsageWindows}
                accountCount={pricing?.accounts ?? accountCount}
                baseHourlyPrice={pricing?.baseHourlyPrice}
                portalHourlyTotal={pricing?.portalHourlyTotal}
                infraHourlyTotal={pricing?.infraHourlyTotal}
                loading={pricingLoading}
                error={pricingError}
              />

              <CreateRequestSubmitBar {...submitBarProps} compact />
            </div>
          </aside>
        </div>
        </>
      )}
    </div>
  );
}
