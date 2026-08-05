'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FilePlus2, Server } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ApiError } from '../../../lib/apiClient';
import {
  chargeCloudRequestWallet,
  getCloudRequestWallet,
  linkCloudRequestWalletCharge,
  refundCloudRequestWallet,
} from '../../../lib/cloudRequestWallet';
import { createRequest, getPurchaseClonePayload, listPrivilegedRoles, createPrivilegedRoleRequest } from '../../api/client';
import { AWS_DEFAULT_REGION } from '../../constants';
import { useAwsRoutes } from '../../../lib/cloudPortalRoutes';
import { ProjectSelect } from '@/components/console/ProjectSelect';
import { useIsTenantPortal } from '@/lib/portalMode';
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
import {
  addHoursToDateTimeLocal,
  defaultEndDate,
  defaultStartDate,
  defaultTestIdsEndDate,
  defaultTestIdsStartDate,
  isValidCleanupTime,
  TEST_IDS_DEFAULTS,
  TEST_IDS_MAX_ACCOUNT_COUNT,
} from '../../utils/requestForm';
import { FINAL_FORM_STEP } from './RequestStepper';

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
  const maxAccounts =
    input.idMode === 'test_ids' ? TEST_IDS_MAX_ACCOUNT_COUNT : 50;

  if (step === 1) {
    if (!String(input.projectName || '').trim()) {
      errors.push('Enter a project name.');
    }
    if (!input.idMode) {
      errors.push('Select AWS test_ids or AWS IDs.');
    }
    if (
      !Number.isInteger(input.accountCount) ||
      input.accountCount <= 0 ||
      input.accountCount > maxAccounts
    ) {
      errors.push(
        input.idMode === 'test_ids'
          ? `Account count must be between 1 and ${TEST_IDS_MAX_ACCOUNT_COUNT} for test_ids.`
          : 'Account count must be a positive integer between 1 and 50.'
      );
    }
    if (!input.startDate || !input.endDate) {
      errors.push('Start and end dates are required.');
    } else if (new Date(input.endDate) < new Date(input.startDate)) {
      errors.push('End date must be on or after start date.');
    }
  }

  if (step === 2 && input.enableDailyUsage && input.idMode !== 'test_ids') {
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

  if (step === 3) {
    const cleanupOn = input.idMode === 'test_ids' || input.enableResourceCleanup;
    if (cleanupOn && !isValidCleanupTime(input.resourceCleanupTime)) {
      errors.push('Select a daily cleanup time when resource cleanup is enabled.');
    }
  }

  if (step === 4) {
    if (input.idMode === 'test_ids') {
      if (!Number.isFinite(input.perUserBudgetUsd) || input.perUserBudgetUsd <= 0) {
        errors.push('Test IDs require a per-user budget.');
      }
    } else if (input.budgetEnabled) {
      if (!Number.isFinite(input.perUserBudgetUsd) || input.perUserBudgetUsd <= 0) {
        errors.push('Budget per user must be a positive number.');
      }
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

  if (step === 8) {
    if (!emailPattern.test(input.customerEmail.trim())) {
      errors.push('Enter a valid customer email address.');
    }
  }

  if (step === 9 && !input.region) {
    errors.push('Select an AWS region.');
  }

  return errors;
}

function validateForm(input) {
  const errors = [];
  for (let step = 1; step <= FINAL_FORM_STEP; step += 1) {
    errors.push(...validateStep(step, input));
  }
  return errors;
}

export function RequestWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromTestRequest = searchParams.get('fromTestRequest');
  const purchaseToken = searchParams.get('purchaseToken');
  const isPurchaseConvert = Boolean(fromTestRequest && purchaseToken);
  const AWS_ROUTES = useAwsRoutes();
  const isTenantPortal = useIsTenantPortal();
  const { services, servicesByCategory, loading, error, refetch } = useServiceCatalog();

  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachableStep, setMaxReachableStep] = useState(1);
  const [stepErrors, setStepErrors] = useState([]);

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedInstances, setSelectedInstances] = useState([]);
  const [permissionOverrides, setPermissionOverrides] = useState({});
  const [region, setRegion] = useState('');
  const [projectName, setProjectName] = useState('');
  const [rackoProjectId, setRackoProjectId] = useState('');
  const [idMode, setIdMode] = useState(isPurchaseConvert ? 'aws_ids' : null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [accountCount, setAccountCount] = useState(10);
  const [costingMode, setCostingMode] = useState('shared');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const awsIdsSnapshotRef = useRef(null);
  const [convertedFromRequestId, setConvertedFromRequestId] = useState(null);
  const [cloneLoading, setCloneLoading] = useState(isPurchaseConvert);
  const [cloneError, setCloneError] = useState(null);
  const [accessType, setAccessType] = useState(() => {
    const days = durationDaysBetween(defaultStartDate, defaultEndDate);
    return days > 7 ? 'identity_center' : 'magic_link';
  });
  const [enableDailyUsage, setEnableDailyUsage] = useState(false);
  const [usageWindows, setUsageWindows] = useState([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [enableResourceCleanup, setEnableResourceCleanup] = useState(false);
  const [resourceCleanupTime, setResourceCleanupTime] = useState('');
  const [resourceCleanupTimezone, setResourceCleanupTimezone] = useState('Asia/Kolkata');
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [perUserBudgetUsd, setPerUserBudgetUsd] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletCurrency, setWalletCurrency] = useState('INR');
  const [usdToInrRate, setUsdToInrRate] = useState(DEFAULT_USD_TO_INR_RATE);
  const [walletLoading, setWalletLoading] = useState(true);
  const [privilegedRoleOpen, setPrivilegedRoleOpen] = useState(false);
  const [privilegedRoles, setPrivilegedRoles] = useState([]);
  const [privilegedRolesLoading, setPrivilegedRolesLoading] = useState(false);
  const [selectedPrivilegedRole, setSelectedPrivilegedRole] = useState('');
  const [privilegedRoleSubmitting, setPrivilegedRoleSubmitting] = useState(false);
  const [privilegedRoleSubmitted, setPrivilegedRoleSubmitted] = useState(false);
  const [privilegedRoleMessage, setPrivilegedRoleMessage] = useState(null);
  const [privilegedRoleMessageType, setPrivilegedRoleMessageType] = useState(null);

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
      projectName,
      idMode,
      customerEmail,
      accountCount,
      startDate,
      endDate,
      enableDailyUsage,
      usageWindows,
      enableResourceCleanup,
      resourceCleanupTime,
      resourceCleanupTimezone,
      budgetEnabled,
      perUserBudgetUsd,
      selectedServiceIds,
      selectedInstances,
      instanceServices,
      flatRateServices,
      region,
    }),
    [
      projectName,
      idMode,
      customerEmail,
      accountCount,
      startDate,
      endDate,
      enableDailyUsage,
      usageWindows,
      enableResourceCleanup,
      resourceCleanupTime,
      resourceCleanupTimezone,
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
      usageWindows: idMode === 'test_ids' ? [] : enableDailyUsage ? usageWindows : [],
      costingMode,
    };
  }, [
    selectedServiceIds,
    selectedInstances,
    selectedServices,
    pricingRegion,
    accountCount,
    startDate,
    endDate,
    idMode,
    enableDailyUsage,
    usageWindows,
    costingMode,
  ]);

  const { estimate, loading: estimateLoading, error: estimateError } =
    usePricingEstimate(estimatePayload);

  const {
    regions: availableRegions,
    loading: regionsLoading,
    error: regionsError,
  } = useAvailableRegions(selectedServiceIds, selectedInstances);

  const showFinalStepPanel = currentStep === FINAL_FORM_STEP;

  const refreshWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const wallet = await getCloudRequestWallet();
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

  useEffect(() => {
    if (!isPurchaseConvert || !purchaseToken) return;

    let cancelled = false;
    setCloneLoading(true);
    setCloneError(null);

    void getPurchaseClonePayload(purchaseToken)
      .then((payload) => {
        if (cancelled) return;
        setConvertedFromRequestId(payload.sourceRequestId);
        setProjectName(payload.projectName || '');
        setIdMode('aws_ids');
        setCustomerEmail(payload.customerEmail || '');
        setAccountCount(payload.accountCount || 1);
        setCostingMode(payload.costingMode || 'shared');
        setAccessType(payload.accessType || 'magic_link');
        setStartDate(defaultStartDate());
        setEndDate(defaultEndDate());
        setEnableDailyUsage(Boolean(payload.enableDailyUsage));
        setUsageWindows(
          (payload.usageWindows || []).map((window) => ({
            dayOfWeek: window.dayOfWeek ?? window.day_of_week,
            windowStartTime: window.windowStartTime || window.window_start_time || '09:00',
            windowEndTime: window.windowEndTime || window.window_end_time || '17:00',
            timezone: window.timezone || payload.timezone || 'Asia/Kolkata',
            dailyLimitHours: window.dailyLimitHours ?? window.daily_limit_hours ?? undefined,
          }))
        );
        setTimezone(payload.timezone || 'Asia/Kolkata');
        setEnableResourceCleanup(Boolean(payload.resourceCleanupEnabled));
        setResourceCleanupTime(payload.resourceCleanupTime || '');
        setResourceCleanupTimezone(
          payload.resourceCleanupTimezone || payload.timezone || 'Asia/Kolkata'
        );
        if (payload.perUserBudgetUsd != null) {
          setBudgetEnabled(true);
          setPerUserBudgetUsd(payload.perUserBudgetUsd);
        }
        setRegion(payload.region || '');
        setSelectedServiceIds(
          (payload.selectedServices || [])
            .map((service) => service.serviceId)
            .filter(Boolean)
        );
        setSelectedInstances(
          (payload.selectedServices || [])
            .filter((service) => service.instanceType)
            .map((service) => ({
              serviceId: service.serviceId,
              instanceType: service.instanceType,
            }))
        );
        const nextOverrides = {};
        for (const entry of payload.permissions || []) {
          if (entry.serviceId) {
            nextOverrides[entry.serviceId] = entry.policies || [];
          }
        }
        setPermissionOverrides(nextOverrides);
        setMaxReachableStep(FINAL_FORM_STEP);
      })
      .catch((err) => {
        if (cancelled) return;
        setCloneError(
          err instanceof ApiError ? err.message : 'Unable to load purchase details from this link.'
        );
      })
      .finally(() => {
        if (!cancelled) setCloneLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isPurchaseConvert, purchaseToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadPrivilegedRoles() {
      setPrivilegedRolesLoading(true);
      try {
        const roles = await listPrivilegedRoles();
        if (!cancelled) {
          setPrivilegedRoles(roles);
        }
      } catch {
        if (!cancelled) {
          setPrivilegedRoles([]);
        }
      } finally {
        if (!cancelled) {
          setPrivilegedRolesLoading(false);
        }
      }
    }
    void loadPrivilegedRoles();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmitPrivilegedRoleRequest = useCallback(async () => {
    if (!selectedPrivilegedRole) {
      setPrivilegedRoleMessage('Select a privileged role.');
      setPrivilegedRoleMessageType('error');
      return;
    }

    if (!customerEmail.trim()) {
      setPrivilegedRoleMessage('Enter a customer email first.');
      setPrivilegedRoleMessageType('error');
      return;
    }

    setPrivilegedRoleSubmitting(true);
    setPrivilegedRoleMessage(null);
    setPrivilegedRoleMessageType(null);
    setPrivilegedRoleSubmitted(false);
    try {
      await createPrivilegedRoleRequest({
        customerEmail: customerEmail.trim(),
        awsRole: selectedPrivilegedRole,
      });
      setPrivilegedRoleSubmitted(true);
      setPrivilegedRoleMessageType('success');
      setPrivilegedRoleMessage(
        `${selectedPrivilegedRole} was submitted for ${customerEmail.trim()}. An org admin will approve it in Lab Management.`
      );
    } catch (err) {
      setPrivilegedRoleSubmitted(false);
      setPrivilegedRoleMessageType('error');
      setPrivilegedRoleMessage(
        err instanceof ApiError ? err.message : 'Failed to submit privileged role request.'
      );
    } finally {
      setPrivilegedRoleSubmitting(false);
    }
  }, [selectedPrivilegedRole, customerEmail]);

  const handleSelectedPrivilegedRoleChange = useCallback((value) => {
    setSelectedPrivilegedRole(value);
    setPrivilegedRoleSubmitted(false);
    setPrivilegedRoleMessage(null);
    setPrivilegedRoleMessageType(null);
  }, []);

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

  const handleIdModeChange = useCallback(
    (mode) => {
      if (isPurchaseConvert) return;
      if (mode === 'test_ids') {
        if (idMode !== 'test_ids') {
          awsIdsSnapshotRef.current = {
            accountCount,
            costingMode,
            startDate,
            endDate,
            enableDailyUsage,
            usageWindows,
            enableResourceCleanup,
            resourceCleanupTime,
            resourceCleanupTimezone,
            budgetEnabled,
            perUserBudgetUsd,
            accessType,
          };
        }

        setIdMode('test_ids');
        setAccountCount(TEST_IDS_DEFAULTS.accountCount);
        setCostingMode('per_user');
        setStartDate(defaultTestIdsStartDate());
        setEndDate(defaultTestIdsEndDate());
        setEnableDailyUsage(false);
        setUsageWindows([]);
        setEnableResourceCleanup(true);
        setResourceCleanupTime('');
        setResourceCleanupTimezone('Asia/Kolkata');
        setBudgetEnabled(true);
        setPerUserBudgetUsd(TEST_IDS_DEFAULTS.perUserBudgetUsd);
        setAccessType('magic_link');
        return;
      }

      const snapshot = awsIdsSnapshotRef.current;
      setIdMode('aws_ids');
      setAccountCount(snapshot?.accountCount ?? 10);
      setCostingMode(snapshot?.costingMode ?? 'shared');
      setStartDate(snapshot?.startDate ?? defaultStartDate());
      setEndDate(snapshot?.endDate ?? defaultEndDate());
      setEnableDailyUsage(snapshot?.enableDailyUsage ?? false);
      setUsageWindows(snapshot?.usageWindows ?? []);
      setEnableResourceCleanup(snapshot?.enableResourceCleanup ?? false);
      setResourceCleanupTime(snapshot?.resourceCleanupTime ?? '');
      setResourceCleanupTimezone(snapshot?.resourceCleanupTimezone ?? 'Asia/Kolkata');
      setBudgetEnabled(snapshot?.budgetEnabled ?? false);
      setPerUserBudgetUsd(
        snapshot?.budgetEnabled || snapshot?.costingMode === 'per_user'
          ? snapshot?.perUserBudgetUsd
          : undefined
      );
      setAccessType(snapshot?.accessType ?? 'magic_link');
    },
    [
      accessType,
      accountCount,
      budgetEnabled,
      costingMode,
      enableDailyUsage,
      enableResourceCleanup,
      endDate,
      idMode,
      perUserBudgetUsd,
      resourceCleanupTime,
      resourceCleanupTimezone,
      startDate,
      usageWindows,
      isPurchaseConvert,
    ]
  );

  const handleStartDateChange = useCallback(
    (value) => {
      setStartDate(value);
      if (idMode === 'test_ids') {
        setEndDate(addHoursToDateTimeLocal(value, 24));
      }
    },
    [idMode]
  );

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

    const nextStep = Math.min(currentStep + 1, FINAL_FORM_STEP);
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
        setSubmitError('Unable to load your wallet balance.');
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

    const normalizedUsageWindows =
      idMode === 'test_ids'
        ? []
        : enableDailyUsage
          ? usageWindows.map((window) => ({
              day_of_week: window.dayOfWeek,
              window_start_time: window.windowStartTime,
              window_end_time: window.windowEndTime,
              timezone: window.timezone || timezone,
              daily_limit_hours: window.dailyLimitHours ?? null,
            }))
          : [];

    const resolvedAccessType = idMode === 'test_ids' ? 'magic_link' : accessType;
    const resolvedBudgetEnabled = idMode === 'test_ids' ? true : budgetEnabled;
    const resolvedCleanupEnabled =
      idMode === 'test_ids' ? true : enableResourceCleanup;

    const payload = {
      project_name: projectName.trim(),
      project_id: rackoProjectId || undefined,
      id_mode: isPurchaseConvert ? 'aws_ids' : idMode,
      customer_email: customerEmail.trim(),
      account_count: accountCount,
      costing_mode: costingMode,
      access_type: resolvedAccessType,
      start_date: startDate,
      end_date: endDate,
      timezone:
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : timezone,
      enable_daily_usage: idMode !== 'test_ids' && enableDailyUsage && normalizedUsageWindows.length > 0,
      usage_windows: normalizedUsageWindows,
      enable_resource_cleanup: resolvedCleanupEnabled,
      ...(resolvedCleanupEnabled && isValidCleanupTime(resourceCleanupTime)
        ? {
            resource_cleanup_time: resourceCleanupTime.trim(),
            resource_cleanup_timezone: resourceCleanupTimezone,
            resource_cleanup_interval_hours: 24,
          }
        : {}),
      per_user_budget_usd: resolvedBudgetEnabled ? perUserBudgetUsd : undefined,
      selected_services: selectedServicesPayload,
      selected_permissions: selectedPermissions,
      permissions: permissionsPayload,
      region,
      estimated_price: estimate?.total ?? 0,
      ...(isPurchaseConvert && convertedFromRequestId
        ? {
            converted_from_request_id: convertedFromRequestId,
            purchase_token: purchaseToken || undefined,
          }
        : {}),
    };

    setSubmitting(true);
    let chargedInr = null;

    try {
      if (totalPrice > 0) {
        const charge = await chargeCloudRequestWallet(totalPrice, null, 'aws', {
          projectId: rackoProjectId || undefined,
          serviceKey: 'aws',
        });
        chargedInr = charge.chargedInr;
        setWalletBalance(charge.balance);
        setUsdToInrRate(charge.usdToInrRate);
      }

      try {
        const response = await createRequest(payload);
        const requestId = response.data?.requestId ?? response.requestId;

        if (chargedInr != null && chargedInr > 0) {
          void linkCloudRequestWalletCharge(String(requestId), 'aws').catch(() => undefined);
        }

        router.push(AWS_ROUTES.requestStatus(String(requestId)));
      } catch (createErr) {
        if (chargedInr != null && chargedInr > 0) {
          try {
            const refunded = await refundCloudRequestWallet(chargedInr, null, 'aws');
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
        <div className="h-1 bg-gradient-to-r from-[var(--cloud-accent,#B91C1C)] via-[var(--cloud-accent,#B91C1C)] to-[var(--cloud-accent,#B91C1C)]" />
        <div className="p-6 lg:p-8">
          <Link
            href={AWS_ROUTES.dashboard}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[var(--cloud-accent,#B91C1C)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)] ring-1 ring-[var(--cloud-accent,#B91C1C)]/10">
                <FilePlus2 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cloud-accent,#B91C1C)]">
                  AWS automation
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                  {isPurchaseConvert ? 'Continue purchase from test lab' : 'Create request'}
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                  {isPurchaseConvert
                    ? 'Services and permissions are prefilled from your test lab. Set dates, cleanup, budget, and account count, then submit.'
                    : 'Name your lab, choose test or full AWS IDs, then configure services and send credentials by email.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Server className="h-4 w-4 shrink-0 text-[var(--cloud-accent,#B91C1C)]" />
              <span>Complete each step — Next unlocks the following section</span>
            </div>
          </div>
        </div>
      </div>

      {cloneError && !cloneLoading && <ErrorState message={cloneError} />}

      {(loading || cloneLoading) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <TableSkeleton rows={6} cols={1} embedded />
        </div>
      )}

      {!loading && !cloneLoading && !error && !cloneError && (
        <div
          className={`grid grid-cols-1 gap-6 ${
            showFinalStepPanel ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''
          }`}
        >
          <div className="min-w-0 space-y-6">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Cost attribution
              </p>
              <p className="mb-3 text-sm text-gray-500">
                Charges stay on your main wallet. Optionally assign a project so spend appears in
                Reports.
              </p>
              <ProjectSelect
                serviceKey="aws"
                value={rackoProjectId}
                onChange={setRackoProjectId}
                portal={isTenantPortal ? 'tenant' : 'org'}
                disabled={submitting}
              />
            </div>
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
              projectName={projectName}
              onProjectNameChange={setProjectName}
              idMode={idMode}
              onIdModeChange={handleIdModeChange}
              purchaseConvertMode={isPurchaseConvert}
              customerEmail={customerEmail}
              onCustomerEmailChange={setCustomerEmail}
              accountCount={accountCount}
              onAccountCountChange={setAccountCount}
              accessType={accessType}
              onAccessTypeChange={setAccessType}
              startDate={startDate}
              onStartDateChange={handleStartDateChange}
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
              resourceCleanupTime={resourceCleanupTime}
              onResourceCleanupTimeChange={setResourceCleanupTime}
              resourceCleanupTimezone={resourceCleanupTimezone}
              onResourceCleanupTimezoneChange={setResourceCleanupTimezone}
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
              privilegedRoleOpen={privilegedRoleOpen}
              onPrivilegedRoleOpenChange={setPrivilegedRoleOpen}
              privilegedRoles={privilegedRoles}
              privilegedRolesLoading={privilegedRolesLoading}
              selectedPrivilegedRole={selectedPrivilegedRole}
              onSelectedPrivilegedRoleChange={handleSelectedPrivilegedRoleChange}
              onSubmitPrivilegedRoleRequest={handleSubmitPrivilegedRoleRequest}
              privilegedRoleSubmitting={privilegedRoleSubmitting}
              privilegedRoleSubmitted={privilegedRoleSubmitted}
              privilegedRoleMessage={privilegedRoleMessage}
              privilegedRoleMessageType={privilegedRoleMessageType}
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
