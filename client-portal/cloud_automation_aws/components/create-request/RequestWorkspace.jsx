'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FilePlus2, Server } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ApiError } from '../../../lib/apiClient';
import {
  chargeAdminWalletForCloudRequest,
  getMyAdminWallet,
  linkAdminWalletCloudCharge,
  refundAdminWalletCloudCharge,
} from '../../../lib/adminBillingApi';
import { createRequest } from '../../api/client';
import { AWS_DEFAULT_REGION } from '../../constants';
import { useAwsRoutes } from '../../../lib/cloudPortalRoutes';
import { DEFAULT_IAM_POLICIES } from '../../config/iamPolicies';
import { usePricingEstimate } from '../../hooks/usePricingEstimate';
import { useAvailableRegions } from '../../hooks/useAvailableRegions';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import {
  convertUsdToInr,
  DEFAULT_USD_TO_INR_RATE,
  formatInr,
} from '../../../cloud_automation/utils/walletBilling';
import { getEffectivePolicies } from './PermissionsPicker';
import { PricingSummary } from './PricingSummary';
import { RequestForm } from './RequestForm';
import { CreateRequestSubmitBar } from './CreateRequestSubmitBar';
import { defaultEndDate, defaultStartDate } from '../../utils/requestForm';

function durationDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function validateStep(step, input) {
  const errors = [];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (step === 1) {
    if (!emailPattern.test(input.customerEmail.trim())) {
      errors.push('Enter a valid customer email address.');
    }
    if (!Number.isInteger(input.accountCount) || input.accountCount <= 0 || input.accountCount > 50) {
      errors.push('Account count must be a positive integer between 1 and 50.');
    }
    if (!input.startDate || !input.endDate) {
      errors.push('Start and end dates are required.');
    } else if (new Date(input.endDate) < new Date(input.startDate)) {
      errors.push('End date must be on or after start date.');
    }
  }

  if (step === 2 && input.enableDailyUsage) {
    if (input.usageWindows.length === 0) {
      errors.push('Enable at least one day when daily usage windows are turned on.');
    }
    for (const window of input.usageWindows) {
      if (!window.windowStartTime || !window.windowEndTime) {
        errors.push('Each enabled usage window must have a start and end time.');
      } else if (window.windowStartTime >= window.windowEndTime) {
        errors.push('Usage window end time must be after the start time.');
      }
      if (
        window.dailyLimitHours != null &&
        (window.dailyLimitHours < 0.5 || window.dailyLimitHours > 24)
      ) {
        errors.push('Max hours/day must be between 0.5 and 24 when set.');
      }
    }
  }

  if (step === 3 && input.enableResourceCleanup) {
    if (
      !Number.isInteger(input.resourceCleanupIntervalHours) ||
      input.resourceCleanupIntervalHours < 1 ||
      input.resourceCleanupIntervalHours > 24
    ) {
      errors.push('Enter a resource cleanup interval between 1 and 24 hours when enabled.');
    }
  }

  if (step === 4 && input.budgetEnabled) {
    if (!Number.isFinite(input.perUserBudgetUsd) || input.perUserBudgetUsd <= 0) {
      errors.push('Budget per user must be a positive number.');
    }
  }

  if (step === 5 && input.selectedServiceIds.length === 0) {
    errors.push('Select at least one service.');
  }

  if (step === 6) {
    for (const service of input.instanceServices) {
      const hasInstance = input.selectedInstances.some((entry) => entry.serviceId === service._id);
      if (!hasInstance) {
        errors.push(`Select an instance for ${service.name}.`);
      }
    }
    for (const service of input.flatRateServices || []) {
      const hasTier = input.selectedInstances.some((entry) => entry.serviceId === service._id);
      if (!hasTier) {
        errors.push(`Select a usage estimate for ${service.name}.`);
      }
    }
  }

  if (step === 8 && !input.region) {
    errors.push('Select an AWS region.');
  }

  return errors;
}

function validateForm(input) {
  const errors = [];
  for (let step = 1; step <= 8; step += 1) {
    errors.push(...validateStep(step, input));
  }
  return errors;
}

export function RequestWorkspace() {
  const router = useRouter();
  const AWS_ROUTES = useAwsRoutes();
  const { services, servicesByCategory, loading, error, refetch } = useServiceCatalog();

  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachableStep, setMaxReachableStep] = useState(1);
  const [stepErrors, setStepErrors] = useState([]);

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedInstances, setSelectedInstances] = useState([]);
  const [permissionOverrides, setPermissionOverrides] = useState({});
  const [region, setRegion] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [accountCount, setAccountCount] = useState(10);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [accessType, setAccessType] = useState(() => {
    const days = durationDaysBetween(defaultStartDate, defaultEndDate);
    return days > 7 ? 'identity_center' : 'magic_link';
  });
  const [enableDailyUsage, setEnableDailyUsage] = useState(false);
  const [usageWindows, setUsageWindows] = useState([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [enableResourceCleanup, setEnableResourceCleanup] = useState(false);
  const [resourceCleanupIntervalHours, setResourceCleanupIntervalHours] = useState(undefined);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [perUserBudgetUsd, setPerUserBudgetUsd] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletCurrency, setWalletCurrency] = useState('INR');
  const [usdToInrRate, setUsdToInrRate] = useState(DEFAULT_USD_TO_INR_RATE);
  const [walletLoading, setWalletLoading] = useState(true);

  const durationDays = useMemo(
    () => durationDaysBetween(startDate, endDate),
    [startDate, endDate]
  );

  const pricingRegion = region || AWS_DEFAULT_REGION;

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service._id)),
    [services, selectedServiceIds]
  );

  const instanceServices = useMemo(
    () => selectedServices.filter((service) => service.pricingType === 'instance'),
    [selectedServices]
  );

  const flatRateServices = useMemo(
    () => selectedServices.filter((service) => service.pricingType === 'flat_rate'),
    [selectedServices]
  );

  const validationInput = useMemo(
    () => ({
      customerEmail,
      accountCount,
      startDate,
      endDate,
      enableDailyUsage,
      usageWindows,
      enableResourceCleanup,
      resourceCleanupIntervalHours,
      budgetEnabled,
      perUserBudgetUsd,
      selectedServiceIds,
      selectedInstances,
      instanceServices,
      flatRateServices,
      region,
    }),
    [
      customerEmail,
      accountCount,
      startDate,
      endDate,
      enableDailyUsage,
      usageWindows,
      enableResourceCleanup,
      resourceCleanupIntervalHours,
      budgetEnabled,
      perUserBudgetUsd,
      selectedServiceIds,
      selectedInstances,
      instanceServices,
      flatRateServices,
      region,
    ]
  );

  const estimatePayload = useMemo(() => {
    if (selectedServiceIds.length === 0 || accountCount <= 0 || !startDate || !endDate) {
      return null;
    }

    return {
      selectedServiceIds,
      selectedInstances,
      selectedServices,
      region: pricingRegion,
      accountCount,
      startDate,
      endDate,
      usageWindows: enableDailyUsage ? usageWindows : [],
      costingMode: 'shared',
    };
  }, [
    selectedServiceIds,
    selectedInstances,
    selectedServices,
    pricingRegion,
    accountCount,
    startDate,
    endDate,
    enableDailyUsage,
    usageWindows,
  ]);

  const { estimate, loading: estimateLoading, error: estimateError } =
    usePricingEstimate(estimatePayload);

  const {
    regions: availableRegions,
    loading: regionsLoading,
    error: regionsError,
  } = useAvailableRegions(selectedServiceIds, selectedInstances);

  const showFinalStepPanel = currentStep === 8;

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

  const handleToggleService = useCallback((serviceId) => {
    setSelectedServiceIds((current) => {
      const isSelected = current.includes(serviceId);
      if (isSelected) {
        setSelectedInstances((instances) =>
          instances.filter((entry) => entry.serviceId !== serviceId)
        );
        setPermissionOverrides((overrides) => {
          const next = { ...overrides };
          delete next[serviceId];
          return next;
        });
        return current.filter((id) => id !== serviceId);
      }

      const service = services.find((entry) => entry._id === serviceId);
      if (service && DEFAULT_IAM_POLICIES[service.name]) {
        setPermissionOverrides((overrides) => ({ ...overrides, [serviceId]: [] }));
      }

      return [...current, serviceId];
    });
  }, [services]);

  const handleSelectInstance = useCallback((serviceId, instanceType) => {
    setSelectedInstances((current) => {
      const filtered = current.filter((entry) => entry.serviceId !== serviceId);
      return [...filtered, { serviceId, instanceType }];
    });
  }, []);

  const handlePermissionChange = useCallback((serviceId, policies) => {
    setPermissionOverrides((current) => ({ ...current, [serviceId]: policies }));
  }, []);

  const handleRegionChange = useCallback((nextRegion) => {
    setRegion(nextRegion);
  }, []);

  useEffect(() => {
    if (!region) return;
    if (availableRegions.length === 0) return;
    if (!availableRegions.some((entry) => entry.code === region)) {
      setRegion('');
    }
  }, [availableRegions, region]);

  const goToStep = useCallback((step) => {
    setCurrentStep(step);
    setStepErrors([]);
  }, []);

  const handleNext = () => {
    const errors = validateStep(currentStep, validationInput);
    setStepErrors(errors);
    if (errors.length > 0) return;

    const nextStep = Math.min(currentStep + 1, 8);
    setMaxReachableStep((current) => Math.max(current, nextStep));
    setCurrentStep(nextStep);
    setStepErrors([]);
  };

  const handleBack = () => {
    setCurrentStep((current) => Math.max(current - 1, 1));
    setStepErrors([]);
  };

  const handleSubmit = async () => {
    const errors = validateForm(validationInput);
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

    const breakdownMap = new Map(
      (estimate?.breakdown ?? []).map((entry) => [entry.serviceName, entry])
    );

    const selectedServicesPayload = selectedServices.map((service) => {
      const instance = selectedInstances.find((entry) => entry.serviceId === service._id);
      const pricingLine = breakdownMap.get(service.name);
      return {
        serviceId: service._id,
        serviceName: service.name,
        instanceType: instance?.instanceType ?? null,
        pricePerDay: pricingLine?.pricePerDay ?? 0,
        pricingType: service.pricingType,
      };
    });

    const permissionsPayload = selectedServices.map((service) => ({
      serviceId: service._id,
      serviceName: service.name,
      policies: getEffectivePolicies(service.name, permissionOverrides[service._id]),
    }));

    const selectedPermissions = Object.fromEntries(
      permissionsPayload.map((entry) => [String(entry.serviceId), entry.policies])
    );

    const normalizedUsageWindows = enableDailyUsage
      ? usageWindows.map((window) => ({
          day_of_week: window.dayOfWeek,
          window_start_time: window.windowStartTime,
          window_end_time: window.windowEndTime,
          timezone: window.timezone || timezone,
          daily_limit_hours: window.dailyLimitHours ?? null,
        }))
      : [];

    const payload = {
      customer_email: customerEmail.trim(),
      account_count: accountCount,
      costing_mode: 'shared',
      access_type: accessType,
      start_date: startDate,
      end_date: endDate,
      timezone:
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : timezone,
      enable_daily_usage: enableDailyUsage && normalizedUsageWindows.length > 0,
      usage_windows: normalizedUsageWindows,
      enable_resource_cleanup: enableResourceCleanup,
      resource_cleanup_interval_hours: enableResourceCleanup
        ? resourceCleanupIntervalHours
        : undefined,
      per_user_budget_usd: budgetEnabled ? perUserBudgetUsd : undefined,
      selected_services: selectedServicesPayload,
      selected_permissions: selectedPermissions,
      permissions: permissionsPayload,
      region,
      estimated_price: estimate?.total ?? 0,
    };

    setSubmitting(true);
    let chargedInr = null;

    try {
      if (totalPrice > 0) {
        const charge = await chargeAdminWalletForCloudRequest(totalPrice, null, 'aws');
        chargedInr = charge.chargedInr;
        setWalletBalance(charge.balance);
        setUsdToInrRate(charge.usdToInrRate);
      }

      try {
        const response = await createRequest(payload);
        const requestId = response.data?.requestId ?? response.requestId;

        if (chargedInr != null && chargedInr > 0) {
          void linkAdminWalletCloudCharge(String(requestId)).catch(() => undefined);
        }

        router.push(AWS_ROUTES.requestStatus(String(requestId)));
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
          err instanceof ApiError
            ? err.message
            : `Failed to create request: ${err?.message || 'Unknown error'}`
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrice = estimate?.total ?? estimate?.totalPrice ?? null;
  const estimatedInr = convertUsdToInr(totalPrice, usdToInrRate);
  const insufficientBalance =
    Boolean(totalPrice && totalPrice > 0) &&
    estimatedInr != null &&
    walletBalance != null &&
    walletBalance < estimatedInr;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-10">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-[#B91C1C] via-[#DC2626] to-[#B91C1C]" />
        <div className="p-6 lg:p-8">
          <Link
            href={AWS_ROUTES.dashboard}
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
                  AWS automation
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                  Create request
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                  Provision AWS lab access for a customer using the service catalog.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Server className="h-4 w-4 shrink-0 text-[#B91C1C]" />
              <span>Complete each step — Next unlocks the following section</span>
            </div>
          </div>
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <TableSkeleton rows={6} cols={1} embedded />
        </div>
      )}

      {!loading && !error && (
        <div
          className={`grid grid-cols-1 gap-6 ${
            showFinalStepPanel ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''
          }`}
        >
          <div className="min-w-0 space-y-6">
            <RequestForm
              currentStep={currentStep}
              maxReachableStep={maxReachableStep}
              onStepClick={goToStep}
              onNext={handleNext}
              onBack={handleBack}
              stepErrors={stepErrors}
              services={services}
              servicesByCategory={servicesByCategory}
              selectedServiceIds={selectedServiceIds}
              onToggleService={handleToggleService}
              selectedInstances={selectedInstances}
              onSelectInstance={handleSelectInstance}
              pricingRegion={pricingRegion}
              region={region}
              onRegionChange={handleRegionChange}
              customerEmail={customerEmail}
              onCustomerEmailChange={setCustomerEmail}
              accountCount={accountCount}
              onAccountCountChange={setAccountCount}
              accessType={accessType}
              onAccessTypeChange={setAccessType}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              durationDays={durationDays}
              enableDailyUsage={enableDailyUsage}
              onEnableDailyUsageChange={setEnableDailyUsage}
              usageWindows={usageWindows}
              onUsageWindowsChange={setUsageWindows}
              timezone={timezone}
              onTimezoneChange={setTimezone}
              enableResourceCleanup={enableResourceCleanup}
              onEnableResourceCleanupChange={setEnableResourceCleanup}
              resourceCleanupIntervalHours={resourceCleanupIntervalHours}
              onResourceCleanupIntervalHoursChange={setResourceCleanupIntervalHours}
              budgetEnabled={budgetEnabled}
              onBudgetEnabledChange={setBudgetEnabled}
              perUserBudgetUsd={perUserBudgetUsd}
              onPerUserBudgetUsdChange={setPerUserBudgetUsd}
              permissionOverrides={permissionOverrides}
              onPermissionChange={handlePermissionChange}
              validationErrors={validationErrors}
              availableRegions={availableRegions}
              regionsLoading={regionsLoading}
              regionsError={regionsError}
            />
          </div>

          {showFinalStepPanel ? (
            <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <PricingSummary
                totalPrice={totalPrice}
                breakdown={estimate?.breakdown ?? []}
                durationHours={estimate?.durationHours}
                calendarHours={estimate?.calendarHours}
                billableHours={estimate?.billableHours}
                usesUsageWindows={estimate?.usesUsageWindows}
                accountCount={accountCount}
                baseHourlyPrice={estimate?.baseHourlyPrice}
                portalHourlyTotal={estimate?.portalHourlyTotal}
                infraHourlyTotal={estimate?.infraHourlyTotal}
                loading={estimateLoading}
                error={estimateError}
              />

              <CreateRequestSubmitBar
                submitting={submitting}
                submitError={submitError}
                totalPrice={totalPrice}
                currency="USD"
                onSubmit={handleSubmit}
                walletBalance={walletBalance}
                walletCurrency={walletCurrency}
                estimatedInr={estimatedInr}
                usdToInrRate={usdToInrRate}
                walletLoading={walletLoading}
                insufficientBalance={insufficientBalance}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
