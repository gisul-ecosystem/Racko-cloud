import mongoose from 'mongoose';
import Request from '../models/Request.js';
import Service from '../models/Service.js';
import { DEFAULT_IAM_POLICIES } from '../config/iamPolicies.js';
import { isEnabledRegion } from './awsRegionService.js';
import {
  getLivePricingForService,
  resolveInstanceTypeForService,
} from './awsLivePricingService.js';

const DAY_NAME_TO_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function durationDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeUsageWindows(rawWindows = [], defaultTimezone = 'Asia/Kolkata') {
  if (!Array.isArray(rawWindows)) {
    return [];
  }

  return rawWindows.map((window) => {
    const dayOfWeek =
      window.dayOfWeek ??
      window.day_of_week ??
      (window.day ? DAY_NAME_TO_INDEX[window.day] : undefined);

    const windowStartTime =
      window.windowStartTime ??
      window.window_start_time ??
      window.startTime ??
      '09:00';

    const windowEndTime =
      window.windowEndTime ?? window.window_end_time ?? window.endTime ?? '17:00';

    const timezone = window.timezone || defaultTimezone;
    const dailyLimitHours =
      window.dailyLimitHours ?? window.daily_limit_hours ?? undefined;

    return {
      dayOfWeek,
      windowStartTime: String(windowStartTime).slice(0, 5),
      windowEndTime: String(windowEndTime).slice(0, 5),
      timezone,
      dailyLimitHours: dailyLimitHours ?? null,
    };
  });
}

function validateUsageWindows(windows) {
  const seenDays = new Set();

  for (const window of windows) {
    if (window.dayOfWeek == null || window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      throw validationError('Each usage window must have a valid day_of_week (0–6).');
    }

    if (seenDays.has(window.dayOfWeek)) {
      throw validationError('usage_windows must not contain duplicate day_of_week values.');
    }
    seenDays.add(window.dayOfWeek);

    if (!window.windowStartTime || !window.windowEndTime) {
      throw validationError('Each usage window must have window_start_time and window_end_time.');
    }

    if (window.windowStartTime >= window.windowEndTime) {
      throw validationError('Usage window end time must be after start time.');
    }

    if (
      window.dailyLimitHours != null &&
      (window.dailyLimitHours < 0.5 || window.dailyLimitHours > 24)
    ) {
      throw validationError('daily_limit_hours must be between 0.5 and 24 when set.');
    }
  }
}

async function resolveSelectedServices(selectedServices, region) {
  const resolved = [];

  for (const entry of selectedServices) {
    const serviceId = entry.serviceId;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw validationError(`Invalid service id: ${serviceId}`);
    }

    const service = await Service.findById(serviceId).lean();
    if (!service) {
      throw validationError(`Service not found: ${serviceId}`);
    }

    let instanceType = entry.instanceType || null;
    let pricePerDay = entry.pricePerDay ?? 0;

    if (service.pricingType === 'instance') {
      const pricing = await getLivePricingForService(
        service,
        instanceType || resolveInstanceTypeForService(service, {}),
        region
      );

      if (!pricing) {
        throw validationError(`No pricing found for ${service.name} in ${region}`);
      }

      instanceType = pricing.instanceType;
      pricePerDay = pricing.pricePerDay;
    } else {
      const pricing = await getLivePricingForService(service, null, region);
      instanceType = null;
      pricePerDay = pricing?.pricePerDay ?? pricing?.unitPrice ?? entry.pricePerDay ?? 0;
    }

    resolved.push({
      serviceId: service._id,
      serviceName: service.name,
      instanceType,
      pricePerDay,
      pricingType: service.pricingType,
    });
  }

  return resolved;
}

function computeEstimatedPrice(resolvedServices, accountCount, durationDays) {
  let total = 0;

  for (const service of resolvedServices) {
    if (service.pricingType === 'instance') {
      total += service.pricePerDay * accountCount * durationDays;
    } else {
      total += service.pricePerDay * durationDays;
    }
  }

  return parseFloat(total.toFixed(2));
}

function buildPermissions(resolvedServices, permissionsInput) {
  const permissionMap = new Map(
    (permissionsInput ?? []).map((entry) => [String(entry.serviceId), entry])
  );

  return resolvedServices.map((service) => {
    const provided = permissionMap.get(String(service.serviceId));
    if (provided?.policies?.length) {
      return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        policies: provided.policies,
      };
    }

    const defaultPolicy = DEFAULT_IAM_POLICIES[service.serviceName];
    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      policies: defaultPolicy ? [defaultPolicy] : [],
    };
  });
}

function buildSelectedPermissionsMap(resolvedPermissions) {
  const map = new Map();
  for (const entry of resolvedPermissions) {
    map.set(String(entry.serviceId), entry.policies);
  }
  return map;
}

function normalizePayload(payload) {
  const enableDailyUsage =
    payload.enableDailyUsage ??
    payload.enable_daily_usage ??
    (Array.isArray(payload.usageWindows || payload.usage_windows) &&
      (payload.usageWindows || payload.usage_windows).length > 0);

  const enableResourceCleanup =
    payload.enableResourceCleanup ??
    payload.enable_resource_cleanup ??
    payload.cleanupEnabled ??
    false;

  const resourceCleanupIntervalHours =
    payload.resourceCleanupIntervalHours ??
    payload.resource_cleanup_interval_hours ??
    payload.cleanupIntervalHours;

  const timezone = payload.timezone || 'Asia/Kolkata';
  const usageWindows = normalizeUsageWindows(
    payload.usageWindows ?? payload.usage_windows ?? [],
    timezone
  );

  return {
    customerEmail: payload.customerEmail ?? payload.customer_email,
    accountCount: payload.accountCount ?? payload.account_count,
    costingMode: payload.costingMode ?? payload.costing_mode ?? 'shared',
    accessType:
      payload.accessType ??
      payload.access_type ??
      process.env.DEFAULT_ACCESS_TYPE ??
      'magic_link',
    startDate: payload.startDate ?? payload.start_date,
    endDate: payload.endDate ?? payload.end_date,
    region: payload.region,
    enableDailyUsage,
    usageWindows,
    timezone,
    enableResourceCleanup,
    resourceCleanupIntervalHours,
    perUserBudgetUsd: payload.perUserBudgetUsd ?? payload.per_user_budget_usd,
    selectedServices: payload.selectedServices ?? payload.selected_services ?? [],
    permissions: payload.permissions ?? [],
    selectedPermissions: payload.selectedPermissions ?? payload.selected_permissions,
    estimatedPrice: payload.estimatedPrice ?? payload.estimated_price,
  };
}

export const createRequest = async (payload, userId) => {
  const input = normalizePayload(payload);

  if (!isValidEmail(input.customerEmail)) {
    throw validationError('customer_email must be a valid email address');
  }

  if (!Number.isInteger(input.accountCount) || input.accountCount < 1) {
    throw validationError('account_count must be an integer >= 1');
  }

  if (!input.startDate || !input.endDate) {
    throw validationError('start_date and end_date are required');
  }

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (end < start) {
    throw validationError('end_date must be on or after start_date');
  }

  if (end <= today) {
    throw validationError('end_date must be after today');
  }

  if (!input.region?.trim()) {
    throw validationError('region is required');
  }

  const normalizedRegion = input.region.trim();

  if (!(await isEnabledRegion(normalizedRegion))) {
    throw validationError(`region '${normalizedRegion}' is not enabled for this AWS account`);
  }

  if (!Array.isArray(input.selectedServices) || input.selectedServices.length === 0) {
    throw validationError('selected_services must contain at least one entry');
  }

  if (!['magic_link', 'identity_center'].includes(input.accessType)) {
    throw validationError("access_type must be 'magic_link' or 'identity_center'");
  }

  if (input.enableDailyUsage && input.usageWindows.length > 0) {
    validateUsageWindows(input.usageWindows);
  }

  if (input.enableResourceCleanup) {
    if (
      !Number.isInteger(input.resourceCleanupIntervalHours) ||
      input.resourceCleanupIntervalHours < 1 ||
      input.resourceCleanupIntervalHours > 24
    ) {
      throw validationError(
        'resource_cleanup_interval_hours must be an integer between 1 and 24 when cleanup is enabled'
      );
    }
  }

  if (
    input.costingMode === 'shared' &&
    input.perUserBudgetUsd != null &&
    input.perUserBudgetUsd > 0
  ) {
    console.warn(
      '[requestService] per_user_budget_usd set with shared costing_mode — budget tracking is per-account'
    );
  }

  const resolvedServices = await resolveSelectedServices(
    input.selectedServices,
    input.region.trim()
  );
  const resolvedPermissions = buildPermissions(resolvedServices, input.permissions);
  const selectedPermissionsMap = buildSelectedPermissionsMap(resolvedPermissions);
  const durationDays = durationDaysBetween(input.startDate, input.endDate);
  const estimatedPrice = computeEstimatedPrice(
    resolvedServices,
    input.accountCount,
    durationDays
  );

  let resourceCleanupNextRunAt;
  let cleanupNextRunAt;
  if (input.enableResourceCleanup && input.resourceCleanupIntervalHours) {
    const nextRun = new Date(
      Date.now() + input.resourceCleanupIntervalHours * 60 * 60 * 1000
    );
    resourceCleanupNextRunAt = nextRun;
    cleanupNextRunAt = nextRun;
  }

  const request = await Request.create({
    customerEmail: input.customerEmail.trim(),
    accountCount: input.accountCount,
    costingMode: input.costingMode,
    accessType: input.accessType,
    startDate: start,
    endDate: end,
    region: input.region.trim(),
    enableDailyUsage: input.enableDailyUsage && input.usageWindows.length > 0,
    usageWindows: input.usageWindows,
    timezone: input.timezone,
    enableResourceCleanup: input.enableResourceCleanup,
    resourceCleanupIntervalHours: input.enableResourceCleanup
      ? input.resourceCleanupIntervalHours
      : undefined,
    resourceCleanupNextRunAt,
    cleanupEnabled: input.enableResourceCleanup,
    cleanupIntervalHours: input.enableResourceCleanup
      ? input.resourceCleanupIntervalHours
      : undefined,
    cleanupNextRunAt,
    perUserBudgetUsd: input.perUserBudgetUsd ?? null,
    selectedServices: resolvedServices,
    permissions: resolvedPermissions,
    selectedPermissions: selectedPermissionsMap.size ? selectedPermissionsMap : undefined,
    estimatedPrice,
    status: 'Pending',
    createdBy: userId || undefined,
    updatedAt: new Date(),
  });

  return request;
};

export const getAllRequests = async ({ rackoUserId, isSuperAdmin } = {}) => {
  if (!isSuperAdmin && !rackoUserId) {
    return [];
  }

  const query = isSuperAdmin ? {} : { createdBy: rackoUserId };

  return Request.find(query)
    .sort({ createdAt: -1 })
    .populate('selectedServices.serviceId')
    .lean();
};

export const getRequestById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(id).populate('selectedServices.serviceId').lean();
  if (!request) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  return request;
};
