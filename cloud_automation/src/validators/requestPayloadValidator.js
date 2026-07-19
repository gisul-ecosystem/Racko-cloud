const AppError = require('../utils/AppError');
const { parseFlexibleDateTime } = require('../utils/dateTime');
const { validateUsageSchedule } = require('../utils/usageSchedule');
const { normalizeCostingMode } = require('../utils/costingMode');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedRequestFields = new Set([
  'customerEmail',
  'accountCount',
  'location',
  'serviceIds',
  'selectedRoles',
  'selectedInstances',
  'provisionServiceIds',
  'startDate',
  'endDate',
  'enableDailyUsage',
  'dailyLimitMinutes',
  'usageSchedule',
  'costingMode',
  'cleanupEnabled',
  'cleanupIntervalHours',
  'perUserBudgetUsd',
  'resourceCleanupEnabled',
  'resourceCleanupIntervalHours',
  'resourceCleanupAction',
  'usageWindows'
]);

const timePattern = /^\d{2}:\d{2}$/;

const validateRequestPayload = (body) => {
  const invalidFields = Object.keys(body).filter((field) => !allowedRequestFields.has(field));
  const {
    customerEmail,
    accountCount,
    location,
    serviceIds,
    selectedRoles,
    selectedInstances,
    provisionServiceIds,
    startDate,
    endDate,
    enableDailyUsage,
    dailyLimitMinutes,
    usageSchedule,
    costingMode,
    cleanupEnabled,
    cleanupIntervalHours,
    perUserBudgetUsd,
    resourceCleanupEnabled,
    resourceCleanupIntervalHours,
    resourceCleanupAction,
    usageWindows
  } = body;

  if (invalidFields.length > 0) {
    throw new AppError(`Invalid field(s): ${invalidFields.join(', ')}`, 400);
  }

  if (typeof customerEmail !== 'string' || !emailPattern.test(customerEmail.trim())) {
    throw new AppError('customerEmail must be a valid email address.', 400);
  }

  if (!Number.isInteger(accountCount) || accountCount <= 0) {
    throw new AppError('accountCount must be a positive integer.', 400);
  }

  if (typeof location !== 'string' || location.trim().length === 0) {
    throw new AppError('location must be a non-empty string.', 400);
  }

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new AppError('serviceIds must be a non-empty array.', 400);
  }

  if (startDate !== undefined && parseFlexibleDateTime(startDate) === null) {
    throw new AppError('startDate must be a valid date or date-time string when provided.', 400);
  }

  if (endDate !== undefined && parseFlexibleDateTime(endDate) === null) {
    throw new AppError('endDate must be a valid date or date-time string when provided.', 400);
  }

  if (startDate === undefined || endDate === undefined) {
    throw new AppError('startDate and endDate are required.', 400);
  }

  const parsedStart = parseFlexibleDateTime(startDate);
  const parsedEnd = parseFlexibleDateTime(endDate);
  if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
    throw new AppError('endDate must be on or after startDate.', 400);
  }

  if (enableDailyUsage !== undefined && typeof enableDailyUsage !== 'boolean') {
    throw new AppError('enableDailyUsage must be a boolean when provided.', 400);
  }

  if (dailyLimitMinutes !== undefined) {
    if (!Number.isInteger(dailyLimitMinutes) || dailyLimitMinutes <= 0) {
      throw new AppError('dailyLimitMinutes must be a positive integer when provided.', 400);
    }
  }

  if (usageSchedule !== undefined) {
    if (!usageSchedule || typeof usageSchedule !== 'object') {
      throw new AppError('usageSchedule must be an object when provided.', 400);
    }

    const scheduleErrors = validateUsageSchedule(usageSchedule);
    if (scheduleErrors.length > 0) {
      throw new AppError(scheduleErrors.join(' '), 400);
    }
  }

  if (enableDailyUsage === true && !usageSchedule) {
    throw new AppError('usageSchedule is required when enableDailyUsage is true.', 400);
  }

  if (costingMode !== undefined && normalizeCostingMode(costingMode) === null) {
    throw new AppError("costingMode must be 'shared' or 'per_user'.", 400);
  }

  if (cleanupEnabled !== undefined && typeof cleanupEnabled !== 'boolean') {
    throw new AppError('cleanupEnabled must be a boolean when provided.', 400);
  }

  const resolvedCleanupEnabled = cleanupEnabled === true;

  if (cleanupIntervalHours !== undefined) {
    if (!Number.isInteger(cleanupIntervalHours) || cleanupIntervalHours < 1 || cleanupIntervalHours > 168) {
      throw new AppError('cleanupIntervalHours must be an integer between 1 and 168 when provided.', 400);
    }
  }

  if (resolvedCleanupEnabled && cleanupIntervalHours === undefined) {
    throw new AppError('Cleanup interval is required when schedule cleanup is enabled.', 400);
  }

  if (resourceCleanupEnabled !== undefined && typeof resourceCleanupEnabled !== 'boolean') {
    throw new AppError('resourceCleanupEnabled must be a boolean when provided.', 400);
  }

  const resolvedResourceCleanupEnabled = resourceCleanupEnabled === true;

  if (resourceCleanupIntervalHours !== undefined) {
    if (
      !Number.isInteger(resourceCleanupIntervalHours)
      || resourceCleanupIntervalHours < 1
      || resourceCleanupIntervalHours > 24
    ) {
      throw new AppError(
        'resourceCleanupIntervalHours must be an integer between 1 and 24 when provided.',
        400
      );
    }
  }

  if (resolvedResourceCleanupEnabled && resourceCleanupIntervalHours === undefined) {
    throw new AppError(
      'Cleanup interval is required when resource cleanup is enabled.',
      400
    );
  }

  if (resourceCleanupAction !== undefined) {
    if (resourceCleanupAction !== 'delete' && resourceCleanupAction !== 'pause') {
      throw new AppError("resourceCleanupAction must be 'delete' or 'pause' when provided.", 400);
    }
  }

  if (usageWindows !== undefined) {
    if (!Array.isArray(usageWindows)) {
      throw new AppError('usageWindows must be an array when provided.', 400);
    }

    const seenDays = new Set();

    for (const window of usageWindows) {
      if (!window || typeof window !== 'object') {
        throw new AppError('usageWindows must contain window objects.', 400);
      }

      if (!Number.isInteger(window.day_of_week) || window.day_of_week < 0 || window.day_of_week > 6) {
        throw new AppError('usageWindows.day_of_week must be an integer between 0 and 6.', 400);
      }

      if (seenDays.has(window.day_of_week)) {
        throw new AppError('usageWindows must not contain duplicate day_of_week values.', 400);
      }

      seenDays.add(window.day_of_week);

      if (typeof window.window_start_time !== 'string' || !timePattern.test(window.window_start_time)) {
        throw new AppError('usageWindows.window_start_time must use HH:mm format.', 400);
      }

      if (typeof window.window_end_time !== 'string' || !timePattern.test(window.window_end_time)) {
        throw new AppError('usageWindows.window_end_time must use HH:mm format.', 400);
      }

      if (window.window_start_time >= window.window_end_time) {
        throw new AppError('usageWindows.window_end_time must be after window_start_time.', 400);
      }

      if (window.timezone !== undefined && (typeof window.timezone !== 'string' || !window.timezone.trim())) {
        throw new AppError('usageWindows.timezone must be a non-empty string when provided.', 400);
      }

      if (window.daily_limit_hours !== undefined && window.daily_limit_hours !== null) {
        const dailyLimitHours = Number(window.daily_limit_hours);

        if (!Number.isFinite(dailyLimitHours) || dailyLimitHours <= 0 || dailyLimitHours > 24) {
          throw new AppError(
            'usageWindows.daily_limit_hours must be a positive number up to 24 when provided.',
            400
          );
        }
      }
    }
  }

  if (perUserBudgetUsd !== undefined) {
    const budgetValue = Number(perUserBudgetUsd);
    if (!Number.isFinite(budgetValue) || budgetValue <= 0 || budgetValue > 100000) {
      throw new AppError('perUserBudgetUsd must be a positive number up to 100000 when provided.', 400);
    }
  }

  const serviceIdSet = new Set(serviceIds);

  const invalidServiceId = serviceIds.some((serviceId) => !Number.isInteger(serviceId) || serviceId <= 0);

  if (invalidServiceId) {
    throw new AppError('serviceIds must contain only positive integers.', 400);
  }

  if (serviceIdSet.size !== serviceIds.length) {
    throw new AppError('serviceIds must not contain duplicates.', 400);
  }

  if (!Array.isArray(selectedRoles) || selectedRoles.length === 0) {
    throw new AppError('selectedRoles must be a non-empty array.', 400);
  }

  for (const entry of selectedRoles) {
    if (!entry || typeof entry !== 'object') {
      throw new AppError('selectedRoles must contain service role objects.', 400);
    }

    if (!Number.isInteger(entry.serviceId) || entry.serviceId <= 0) {
      throw new AppError('selectedRoles.serviceId must be a positive integer.', 400);
    }

    if (!serviceIdSet.has(entry.serviceId)) {
      throw new AppError(`selectedRoles contains unknown serviceId: ${entry.serviceId}`, 400);
    }

    if (!Array.isArray(entry.roles) || entry.roles.length === 0) {
      throw new AppError('selectedRoles.roles must be a non-empty array.', 400);
    }

    const invalidRole = entry.roles.some((role) => typeof role !== 'string' || role.trim().length === 0);
    if (invalidRole) {
      throw new AppError('selectedRoles.roles must contain non-empty strings.', 400);
    }
  }

  if (selectedInstances !== undefined) {
    if (!Array.isArray(selectedInstances)) {
      throw new AppError('selectedInstances must be an array when provided.', 400);
    }

    for (const entry of selectedInstances) {
      if (!entry || typeof entry !== 'object') {
        throw new AppError('selectedInstances must contain instance objects.', 400);
      }

      if (!Number.isInteger(entry.serviceId) || entry.serviceId <= 0) {
        throw new AppError('selectedInstances.serviceId must be a positive integer.', 400);
      }

      if (!serviceIdSet.has(entry.serviceId)) {
        throw new AppError(`selectedInstances contains unknown serviceId: ${entry.serviceId}`, 400);
      }

      if (typeof entry.instanceOption !== 'string' || entry.instanceOption.trim().length === 0) {
        throw new AppError('selectedInstances.instanceOption must be a non-empty string.', 400);
      }
    }
  }

  if (provisionServiceIds !== undefined) {
    if (!Array.isArray(provisionServiceIds)) {
      throw new AppError('provisionServiceIds must be an array when provided.', 400);
    }

    const invalidProvisionServiceId = provisionServiceIds.some(
      (serviceId) => !Number.isInteger(serviceId) || serviceId <= 0
    );

    if (invalidProvisionServiceId) {
      throw new AppError('provisionServiceIds must contain only positive integers.', 400);
    }

    if (new Set(provisionServiceIds).size !== provisionServiceIds.length) {
      throw new AppError('provisionServiceIds must not contain duplicates.', 400);
    }
  }
};

module.exports = {
  validateRequestPayload
};
