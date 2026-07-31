import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { parseServiceDateTime } from '../utils/serviceDateTime.js';
import Request from '../models/Request.js';
import Service from '../models/Service.js';
import { DEFAULT_IAM_POLICIES } from '../config/iamPolicies.js';
import { computeBillableHours } from '../utils/billableHours.js';
import { isEnabledRegion } from './awsRegionService.js';
import {
  getLivePricingForService,
  resolveInstanceTypeForService,
} from './awsLivePricingService.js';
import { computeServiceCost } from './pricingService.js';
import {
  computeNextDailyCleanupRunAt,
  isValidCleanupTime,
  normalizeCleanupTime,
  normalizeCleanupTimezone,
} from '../utils/resourceCleanupSchedule.js';
import {
  getPurchaseIntentDelayMs,
  markRequestConverted,
} from './purchaseIntentService.js';

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

function computeEstimatedPrice(resolvedServices, accountCount, durationHours, costingMode = 'shared') {
  let total = 0;

  for (const service of resolvedServices) {
    const pricePerHour =
      Number(service.pricePerHour) > 0
        ? Number(service.pricePerHour)
        : Number(service.pricePerDay || 0) / 24;

    const { cost } = computeServiceCost({
      pricingType: service.pricingType,
      pricePerHour,
      durationHours,
      accountCount,
      costingMode,
    });
    total += cost;
  }

  return parseFloat(total.toFixed(2));
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

    resolved.push({
      serviceId: service._id,
      serviceName: service.name,
      instanceType,
      pricePerDay,
      pricePerHour: pricing.pricePerHour ?? (Number(pricePerDay) || 0) / 24,
      pricingType: service.pricingType,
    });
  }

  return resolved;
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

  const resourceCleanupTime =
    payload.resourceCleanupTime ?? payload.resource_cleanup_time ?? null;
  const resourceCleanupTimezone =
    payload.resourceCleanupTimezone ??
    payload.resource_cleanup_timezone ??
    payload.timezone ??
    'Asia/Kolkata';

  const convertedFromRequestId =
    payload.convertedFromRequestId ?? payload.converted_from_request_id ?? null;
  const purchaseToken = payload.purchaseToken ?? payload.purchase_token ?? null;

  const timezone = payload.timezone || 'Asia/Kolkata';
  const usageWindows = normalizeUsageWindows(
    payload.usageWindows ?? payload.usage_windows ?? [],
    timezone
  );

  return {
    customerEmail: payload.customerEmail ?? payload.customer_email,
    projectName: payload.projectName ?? payload.project_name ?? payload.requestName ?? payload.request_name,
    idMode: payload.idMode ?? payload.id_mode,
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
    resourceCleanupTime,
    resourceCleanupTimezone,
    resourceCleanupAction:
      payload.resourceCleanupAction ?? payload.resource_cleanup_action ?? 'delete',
    perUserBudgetUsd: payload.perUserBudgetUsd ?? payload.per_user_budget_usd,
    selectedServices: payload.selectedServices ?? payload.selected_services ?? [],
    permissions: payload.permissions ?? [],
    selectedPermissions: payload.selectedPermissions ?? payload.selected_permissions,
    estimatedPrice: payload.estimatedPrice ?? payload.estimated_price,
    convertedFromRequestId,
    purchaseToken,
  };
}

export const createRequest = async (payload, userId) => {
  const input = normalizePayload(payload);

  if (!isValidEmail(input.customerEmail)) {
    throw validationError('customer_email must be a valid email address');
  }

  const projectName = String(input.projectName || '').trim();
  if (!projectName) {
    throw validationError('project_name is required');
  }

  const idMode = input.idMode || 'aws_ids';
  if (!['test_ids', 'aws_ids'].includes(idMode)) {
    throw validationError("id_mode must be 'test_ids' or 'aws_ids'");
  }

  if (!Number.isInteger(input.accountCount) || input.accountCount < 1) {
    throw validationError('account_count must be an integer >= 1');
  }

  if (idMode === 'test_ids' && input.accountCount > 5) {
    throw validationError('account_count must be <= 5 for test_ids');
  }

  if (!input.startDate || !input.endDate) {
    throw validationError('start_date and end_date are required');
  }

  const start = parseServiceDateTime(input.startDate, input.timezone);
  const end = parseServiceDateTime(input.endDate, input.timezone);
  if (!start || !end) {
    throw validationError('start_date and end_date must be valid datetimes');
  }

  const today = DateTime.now().setZone(input.timezone).startOf('day');

  if (end < start) {
    throw validationError('end_date must be on or after start_date');
  }

  if (end <= today.toJSDate()) {
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
    const hasCleanupTime =
      input.resourceCleanupTime != null &&
      String(input.resourceCleanupTime).trim() !== '';

    if (hasCleanupTime) {
      if (!isValidCleanupTime(input.resourceCleanupTime)) {
        throw validationError('resource_cleanup_time must be in HH:MM format when provided.');
      }
      try {
        normalizeCleanupTimezone(input.resourceCleanupTimezone);
      } catch (err) {
        throw validationError(err.message);
      }
    } else if (
      !Number.isInteger(input.resourceCleanupIntervalHours) ||
      input.resourceCleanupIntervalHours < 1 ||
      input.resourceCleanupIntervalHours > 24
    ) {
      throw validationError(
        'resource_cleanup_time is required when cleanup is enabled, or provide resource_cleanup_interval_hours between 1 and 24.'
      );
    }

    if (input.resourceCleanupAction !== 'delete') {
      throw validationError("AWS resource_cleanup_action currently supports 'delete' only");
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
  const { billableHours } = computeBillableHours(
    start,
    end,
    input.enableDailyUsage ? input.usageWindows : []
  );
  const estimatedPrice = computeEstimatedPrice(
    resolvedServices,
    input.accountCount,
    billableHours,
    input.costingMode
  );

  let resourceCleanupNextRunAt;
  let cleanupNextRunAt;
  let resolvedResourceCleanupTime = null;
  let resolvedResourceCleanupTimezone = null;
  let resolvedResourceCleanupIntervalHours = null;

  if (input.enableResourceCleanup) {
    const hasCleanupTime =
      input.resourceCleanupTime != null &&
      String(input.resourceCleanupTime).trim() !== '';

    if (hasCleanupTime) {
      resolvedResourceCleanupTime = normalizeCleanupTime(input.resourceCleanupTime);
      resolvedResourceCleanupTimezone = normalizeCleanupTimezone(
        input.resourceCleanupTimezone,
        input.timezone
      );
      resolvedResourceCleanupIntervalHours = 24;
      const nextRun = computeNextDailyCleanupRunAt({
        timeHHMM: resolvedResourceCleanupTime,
        timezone: resolvedResourceCleanupTimezone,
      });
      resourceCleanupNextRunAt = nextRun;
      cleanupNextRunAt = nextRun;
    } else if (input.resourceCleanupIntervalHours) {
      resolvedResourceCleanupIntervalHours = input.resourceCleanupIntervalHours;
      const nextRun = new Date(
        Date.now() + input.resourceCleanupIntervalHours * 60 * 60 * 1000
      );
      resourceCleanupNextRunAt = nextRun;
      cleanupNextRunAt = nextRun;
    }
  }

  const request = await Request.create({
    customerEmail: input.customerEmail.trim(),
    projectName,
    requestName: projectName,
    idMode,
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
      ? resolvedResourceCleanupIntervalHours ?? undefined
      : undefined,
    resourceCleanupTime: resolvedResourceCleanupTime ?? undefined,
    resourceCleanupTimezone: resolvedResourceCleanupTimezone ?? undefined,
    resourceCleanupAction: input.resourceCleanupAction,
    resourceCleanupNextRunAt,
    cleanupEnabled: input.enableResourceCleanup,
    cleanupIntervalHours: input.enableResourceCleanup
      ? resolvedResourceCleanupIntervalHours ?? undefined
      : undefined,
    cleanupNextRunAt,
    perUserBudgetUsd: input.perUserBudgetUsd ?? null,
    purchaseIntentDueAt:
      idMode === 'test_ids' ? new Date(Date.now() + getPurchaseIntentDelayMs()) : undefined,
    convertedFromRequestId:
      input.convertedFromRequestId &&
      mongoose.Types.ObjectId.isValid(input.convertedFromRequestId)
        ? input.convertedFromRequestId
        : undefined,
    selectedServices: resolvedServices,
    permissions: resolvedPermissions,
    selectedPermissions: selectedPermissionsMap.size ? selectedPermissionsMap : undefined,
    estimatedPrice,
    status: 'Pending',
    createdBy: userId || undefined,
    updatedAt: new Date(),
  });

  if (input.convertedFromRequestId && mongoose.Types.ObjectId.isValid(input.convertedFromRequestId)) {
    try {
      await markRequestConverted(input.convertedFromRequestId, request._id);
    } catch (err) {
      console.warn('[requestService] Failed to mark source test lab converted:', err.message);
    }
  }

  try {
    const { linkPrivilegedRoleRequestsToRequest } = await import('./privilegedRoleService.js');
    await linkPrivilegedRoleRequestsToRequest(request._id, request.customerEmail);
  } catch (err) {
    console.warn('[requestService] Failed to link privileged role requests:', err.message);
  }

  return request;
};

export const getAllRequests = async ({ rackoUserId, isSuperAdmin, ownerId } = {}) => {
  if (!isSuperAdmin && !rackoUserId) {
    return [];
  }

  const filterOwnerId = String(ownerId || '').trim();
  let query = {};

  if (isSuperAdmin && filterOwnerId) {
    query = { createdBy: filterOwnerId };
  } else if (!isSuperAdmin) {
    query = { createdBy: rackoUserId };
  }

  return Request.find(query)
    .sort({ createdAt: -1 })
    .populate('selectedServices.serviceId')
    .lean();
};

export const getRequestById = async (id, { rackoUserId, isSuperAdmin } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(id).populate('selectedServices.serviceId').lean();
  if (!request) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperAdmin) {
    if (!rackoUserId || String(request.createdBy || '') !== String(rackoUserId)) {
      const error = new Error('Request not found');
      error.statusCode = 404;
      throw error;
    }
  }

  return request;
};
