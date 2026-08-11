import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import Service from '../models/Service.js';
import { resolveDefaultRole } from '../config/iamPolicies.js';
import { parseServiceDateTime } from '../utils/serviceDateTime.js';
import { computeBillableHours } from '../utils/billableHours.js';
import {
  computeNextDailyCleanupRunAt,
  isValidCleanupTime,
  normalizeCleanupTime,
  normalizeCleanupTimezone,
} from '../utils/resourceCleanupSchedule.js';
import { computeServiceCost } from './pricingService.js';
import {
  getLivePricingForService,
  resolveInstanceTypeForService,
} from './gcpLivePricingService.js';
import { isEnabledRegion } from './gcpPricingService.js';
import { resolvePortalBaseUrlFromRequestHeaders } from '../utils/portalUrl.js';

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizePayload(payload) {
  return {
    customerEmail: payload.customerEmail ?? payload.customer_email,
    projectName: payload.projectName ?? payload.project_name ?? payload.requestName ?? payload.request_name,
    projectId: payload.projectId ?? payload.project_id ?? null,
    idMode: payload.idMode ?? payload.id_mode ?? 'gcp_ids',
    accountCount: payload.accountCount ?? payload.account_count,
    costingMode: payload.costingMode ?? payload.costing_mode ?? 'shared',
    accessType: payload.accessType ?? payload.access_type ?? 'cloud_identity',
    startDate: payload.startDate ?? payload.start_date,
    endDate: payload.endDate ?? payload.end_date,
    region: payload.region,
    timezone: payload.timezone || 'Asia/Kolkata',
    usageWindows: payload.usageWindows ?? payload.usage_windows ?? [],
    enableDailyUsage: payload.enableDailyUsage ?? payload.enable_daily_usage ?? false,
    enableResourceCleanup: payload.enableResourceCleanup ?? payload.enable_resource_cleanup ?? false,
    resourceCleanupIntervalHours:
      payload.resourceCleanupIntervalHours ?? payload.resource_cleanup_interval_hours,
    resourceCleanupTime: payload.resourceCleanupTime ?? payload.resource_cleanup_time,
    resourceCleanupTimezone:
      payload.resourceCleanupTimezone ?? payload.resource_cleanup_timezone ?? payload.timezone ?? 'Asia/Kolkata',
    resourceCleanupAction:
      payload.resourceCleanupAction ?? payload.resource_cleanup_action ?? 'delete',
    perUserBudgetUsd: payload.perUserBudgetUsd ?? payload.per_user_budget_usd,
    selectedServices: payload.selectedServices ?? payload.selected_services ?? [],
    permissions: payload.permissions ?? [],
    estimatedPrice: payload.estimatedPrice ?? payload.estimated_price,
  };
}

async function resolveSelectedServices(selectedServices, region) {
  const resolved = [];

  for (const entry of selectedServices) {
    const serviceId = entry.serviceId;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw validationError(`Invalid service id: ${serviceId}`);
    }

    const service = await Service.findById(serviceId).lean();
    if (!service) throw validationError(`Service not found: ${serviceId}`);

    const instanceType =
      entry.instanceType || resolveInstanceTypeForService(service, {});
    const pricing = await getLivePricingForService(
      service,
      instanceType || resolveInstanceTypeForService(service, {}),
      region
    );
    if (!pricing) {
      throw validationError(`No pricing found for ${service.name} in ${region}`);
    }

    resolved.push({
      serviceId: service._id,
      serviceName: service.name,
      instanceType: pricing.instanceType,
      pricePerDay: pricing.pricePerDay,
      pricePerHour: pricing.pricePerHour ?? (Number(pricing.pricePerDay) || 0) / 24,
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
    if (provided?.roles?.length) {
      return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        roles: provided.roles,
      };
    }

    if (provided?.policies?.length) {
      return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        roles: provided.policies,
      };
    }

    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      roles: [resolveDefaultRole(service.serviceName)],
    };
  });
}

function buildSelectedPermissionsMap(resolvedPermissions) {
  const map = new Map();
  for (const entry of resolvedPermissions) {
    map.set(String(entry.serviceId), entry.roles);
  }
  return map;
}

function validateUsageWindows(windows) {
  const seenDays = new Set();
  for (const window of windows) {
    const dayOfWeek = window.dayOfWeek ?? window.day_of_week;
    if (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6) {
      throw validationError('Each usage window must have a valid day_of_week (0–6).');
    }
    if (seenDays.has(dayOfWeek)) {
      throw validationError('usage_windows must not contain duplicate day_of_week values.');
    }
    seenDays.add(dayOfWeek);
  }
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

export async function createRequest(payload, userId, options = {}) {
  const input = normalizePayload(payload);
  const portalBaseUrl =
    String(options.portalBaseUrl || '').trim().replace(/\/+$/, '') || undefined;

  if (!isValidEmail(input.customerEmail)) {
    throw validationError('customer_email must be a valid email address');
  }

  const projectName = String(input.projectName || '').trim();
  if (!projectName) throw validationError('project_name is required');

  const idMode = input.idMode || 'gcp_ids';
  if (!['test_ids', 'gcp_ids'].includes(idMode)) {
    throw validationError("id_mode must be 'test_ids' or 'gcp_ids'");
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

  if (end < start) throw validationError('end_date must be on or after start_date');

  const today = DateTime.now().setZone(input.timezone).startOf('day');
  if (end <= today.toJSDate()) {
    throw validationError('end_date must be after today');
  }

  if (!input.region?.trim()) throw validationError('region is required');
  const normalizedRegion = input.region.trim();
  if (!(await isEnabledRegion(normalizedRegion))) {
    throw validationError(`region '${normalizedRegion}' is not enabled`);
  }

  if (!Array.isArray(input.selectedServices) || input.selectedServices.length === 0) {
    throw validationError('selected_services must contain at least one service');
  }

  if (!['magic_link', 'cloud_identity'].includes(input.accessType)) {
    throw validationError("access_type must be 'magic_link' or 'cloud_identity'");
  }

  if (input.enableDailyUsage && input.usageWindows.length > 0) {
    validateUsageWindows(input.usageWindows);
  }

  if (input.enableResourceCleanup) {
    const hasCleanupTime =
      input.resourceCleanupTime != null && String(input.resourceCleanupTime).trim() !== '';
    if (hasCleanupTime && !isValidCleanupTime(input.resourceCleanupTime)) {
      throw validationError('resource_cleanup_time must be in HH:MM format when provided.');
    }
    if (
      !hasCleanupTime &&
      (!Number.isInteger(input.resourceCleanupIntervalHours) ||
        input.resourceCleanupIntervalHours < 1 ||
        input.resourceCleanupIntervalHours > 24)
    ) {
      throw validationError(
        'resource_cleanup_time is required when cleanup is enabled, or provide resource_cleanup_interval_hours between 1 and 24.'
      );
    }
    if (input.resourceCleanupAction !== 'delete') {
      throw validationError("GCP resource_cleanup_action currently supports 'delete' only");
    }
  }

  const resolvedServices = await resolveSelectedServices(input.selectedServices, normalizedRegion);
  const resolvedPermissions = buildPermissions(resolvedServices, input.permissions);
  const selectedPermissionsMap = buildSelectedPermissionsMap(resolvedPermissions);
  const { billableHours } = computeBillableHours(
    start,
    end,
    input.enableDailyUsage ? input.usageWindows : []
  );
  const estimatedPrice =
    input.estimatedPrice != null && Number(input.estimatedPrice) >= 0
      ? Number(input.estimatedPrice)
      : computeEstimatedPrice(
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
      input.resourceCleanupTime != null && String(input.resourceCleanupTime).trim() !== '';

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
      const nextRun = new Date(Date.now() + input.resourceCleanupIntervalHours * 60 * 60 * 1000);
      resourceCleanupNextRunAt = nextRun;
      cleanupNextRunAt = nextRun;
    }
  }

  const request = await Request.create({
    customerEmail: input.customerEmail.trim(),
    projectName,
    requestName: projectName,
    projectId:
      input.projectId && String(input.projectId).trim()
        ? String(input.projectId).trim()
        : undefined,
    idMode,
    accountCount: input.accountCount,
    costingMode: input.costingMode,
    accessType: input.accessType,
    startDate: start,
    endDate: end,
    region: normalizedRegion,
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
    selectedServices: resolvedServices,
    permissions: resolvedPermissions,
    selectedPermissions: selectedPermissionsMap.size ? selectedPermissionsMap : undefined,
    estimatedPrice,
    createdBy: userId,
    portalBaseUrl,
    status: 'Pending',
  });

  return request;
}

export async function getAllRequests({ rackoUserId, isSuperAdmin, ownerId } = {}) {
  const filter = {};

  if (ownerId) {
    filter.createdBy = ownerId;
  } else if (!isSuperAdmin && rackoUserId) {
    filter.createdBy = rackoUserId;
  }

  return Request.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getRequestById(requestId, { rackoUserId, isSuperAdmin } = {}) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(requestId).lean();
  if (!request) throw validationError('Request not found', 404);

  if (!isSuperAdmin && rackoUserId && request.createdBy && request.createdBy !== rackoUserId) {
    throw validationError('Request not found', 404);
  }

  return request;
}

export function resolvePortalFromHeaders(headers) {
  return resolvePortalBaseUrlFromRequestHeaders(headers);
}
