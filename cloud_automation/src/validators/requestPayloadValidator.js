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
  'costingMode'
]);

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
    costingMode
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
