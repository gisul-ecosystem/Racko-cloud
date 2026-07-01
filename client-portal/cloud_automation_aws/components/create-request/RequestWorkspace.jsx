'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { createRequest } from '../../api/client';
import { AWS_DEFAULT_REGION, AWS_ROUTES } from '../../constants';
import { DEFAULT_IAM_POLICIES } from '../../config/iamPolicies';
import { usePricingEstimate } from '../../hooks/usePricingEstimate';
import { useAvailableRegions } from '../../hooks/useAvailableRegions';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import { getEffectivePolicies } from './PermissionsPicker';
import { PricingSummary } from './PricingSummary';
import { RequestForm } from './RequestForm';
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
      region,
    ]
  );

  const estimatePayload = useMemo(() => {
    if (selectedServiceIds.length === 0 || accountCount <= 0 || durationDays <= 0) {
      return null;
    }

    return {
      selectedServiceIds,
      selectedInstances,
      selectedServices,
      region: pricingRegion,
      accountCount,
      durationDays,
      startDate,
      endDate,
    };
  }, [
    selectedServiceIds,
    selectedInstances,
    selectedServices,
    pricingRegion,
    accountCount,
    durationDays,
    startDate,
    endDate,
  ]);

  const { estimate, loading: estimateLoading, error: estimateError } =
    usePricingEstimate(estimatePayload);

  const {
    regions: availableRegions,
    loading: regionsLoading,
    error: regionsError,
  } = useAvailableRegions(selectedServiceIds, selectedInstances);

  const showPricingPanel = currentStep >= 6;

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
    try {
      const response = await createRequest(payload);
      const requestId = response.data?.requestId ?? response.requestId;
      router.push(AWS_ROUTES.requestStatus(String(requestId)));
    } catch (err) {
      setSubmitError(`Failed to create request: ${err?.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrice = estimate?.total ?? null;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div>
        <Link
          href={AWS_ROUTES.dashboard}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to overview
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create request</h1>
        <p className="mt-1 text-sm text-gray-500">
          Provision AWS lab access for a customer using the service catalog.
        </p>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={refetch} />}

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <TableSkeleton rows={6} cols={1} embedded />
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
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

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {showPricingPanel ? (
              <PricingSummary
                totalPrice={totalPrice}
                breakdown={estimate?.breakdown ?? []}
                duration={durationDays}
                accountCount={accountCount}
                loading={estimateLoading}
                error={estimateError}
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">Pricing estimate</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Select services and instances in steps 5–6 to see a live estimate.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              {submitError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || currentStep < 8}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating request…
                  </>
                ) : (
                  'Create request'
                )}
              </button>
              <p className="mt-3 text-center text-xs text-gray-400">
                Submits to POST /api/v1/cloud-automation-aws/requests
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
