'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { createRequest } from '../../api/client';
import { AWS_DEFAULT_REGION, AWS_ROUTES } from '../../constants';
import { DEFAULT_IAM_POLICIES } from '../../config/iamPolicies';
import { usePricingEstimate } from '../../hooks/usePricingEstimate';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import { getEffectivePolicies } from './PermissionsPicker';
import { PricingSummary } from './PricingSummary';
import { RequestForm } from './RequestForm';

function defaultStartDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

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
    if (!Number.isInteger(input.accountCount) || input.accountCount <= 0) {
      errors.push('Account count must be a positive integer.');
    }
    if (!input.startDate || !input.endDate) {
      errors.push('Start and end dates are required.');
    } else if (new Date(input.endDate) < new Date(input.startDate)) {
      errors.push('End date must be on or after start date.');
    }
  }

  if (step === 2 && input.usageWindows.length > 0) {
    for (const window of input.usageWindows) {
      if (!window.startTime || !window.endTime) {
        errors.push('Each enabled usage window must have a start and end time.');
      } else if (window.startTime >= window.endTime) {
        errors.push('Usage window end time must be after the start time.');
      }
    }
  }

  if (step === 3 && input.cleanupEnabled) {
    if (
      !Number.isInteger(input.cleanupIntervalHours) ||
      input.cleanupIntervalHours < 1 ||
      input.cleanupIntervalHours > 24
    ) {
      errors.push('Enter a resource cleanup interval between 1 and 24 hours when enabled.');
    }
  }

  if (step === 4 && input.perUserBudgetUsd !== undefined) {
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
  const [costingMode, setCostingMode] = useState('shared');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [usageWindows, setUsageWindows] = useState([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [cleanupIntervalHours, setCleanupIntervalHours] = useState(undefined);
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
      usageWindows,
      cleanupEnabled,
      cleanupIntervalHours,
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
      usageWindows,
      cleanupEnabled,
      cleanupIntervalHours,
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
      region: pricingRegion,
      accountCount,
      durationDays,
    };
  }, [selectedServiceIds, selectedInstances, pricingRegion, accountCount, durationDays]);

  const { estimate, loading: estimateLoading, error: estimateError } =
    usePricingEstimate(estimatePayload);

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
    setSelectedInstances([]);
  }, []);

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
      };
    });

    const permissionsPayload = selectedServices.map((service) => ({
      serviceId: service._id,
      serviceName: service.name,
      policies: getEffectivePolicies(service.name, permissionOverrides[service._id]),
    }));

    const payload = {
      customerEmail: customerEmail.trim(),
      accountCount,
      costingMode,
      startDate,
      endDate,
      enableDailyUsage: usageWindows.length > 0,
      usageWindows,
      timezone,
      cleanupEnabled,
      cleanupIntervalHours: cleanupEnabled ? cleanupIntervalHours : undefined,
      perUserBudgetUsd,
      selectedServices: selectedServicesPayload,
      permissions: permissionsPayload,
      region,
      estimatedPrice: estimate?.total ?? 0,
    };

    setSubmitting(true);
    try {
      const response = await createRequest(payload);
      router.push(AWS_ROUTES.requestStatus(String(response.requestId)));
    } catch (err) {
      setSubmitError(err?.message || 'Failed to create request.');
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
              costingMode={costingMode}
              onCostingModeChange={setCostingMode}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              usageWindows={usageWindows}
              onUsageWindowsChange={setUsageWindows}
              timezone={timezone}
              onTimezoneChange={setTimezone}
              cleanupEnabled={cleanupEnabled}
              onCleanupEnabledChange={setCleanupEnabled}
              cleanupIntervalHours={cleanupIntervalHours}
              onCleanupIntervalHoursChange={setCleanupIntervalHours}
              perUserBudgetUsd={perUserBudgetUsd}
              onPerUserBudgetUsdChange={setPerUserBudgetUsd}
              permissionOverrides={permissionOverrides}
              onPermissionChange={handlePermissionChange}
              validationErrors={validationErrors}
            />
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <PricingSummary
              totalPrice={totalPrice}
              breakdown={estimate?.breakdown ?? []}
              duration={durationDays}
              accountCount={accountCount}
              loading={estimateLoading}
              error={estimateError}
            />

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              {submitError && <p className="mb-4 text-sm text-red-600">{submitError}</p>}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || currentStep < 8}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting request…
                  </>
                ) : (
                  'Submit request'
                )}
              </button>
              <p className="mt-3 text-center text-xs text-gray-400">
                Submits to AWS provisioning pipeline
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
