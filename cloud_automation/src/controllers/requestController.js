const AppError = require('../utils/AppError');
const requestService = require('../services/requestService');
const cleanupService = require('../services/cleanupService');
const { getMaxDailyLimitMinutes } = require('../utils/usageSchedule');
const { validateRequestPayload } = require('../validators/requestPayloadValidator');
const { resolvePortalBaseUrlFromRequestHeaders } = require('../utils/frontendUrl');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const createRequest = async (req, res, next) => {
  try {
    validateRequestPayload(req.body);

    const payload = {
      customerEmail: req.body.customerEmail.trim(),
      accountCount: req.body.accountCount,
      location: req.body.location.trim(),
      serviceIds: req.body.serviceIds,
      selectedRoles: req.body.selectedRoles,
      selectedInstances: Array.isArray(req.body.selectedInstances) ? req.body.selectedInstances : [],
      provisionServiceIds: Array.isArray(req.body.provisionServiceIds)
        ? req.body.provisionServiceIds
        : undefined,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      enableDailyUsage: req.body.enableDailyUsage === true,
      dailyLimitMinutes: req.body.dailyLimitMinutes
        ? Number(req.body.dailyLimitMinutes)
        : req.body.usageSchedule
          ? getMaxDailyLimitMinutes(req.body.usageSchedule)
          : undefined,
      usageSchedule: req.body.usageSchedule || undefined,
      costingMode: req.body.costingMode,
      cleanupEnabled: req.body.cleanupEnabled === true,
      cleanupIntervalHours:
        req.body.cleanupIntervalHours !== undefined && req.body.cleanupIntervalHours !== null
          ? Number(req.body.cleanupIntervalHours)
          : undefined,
      perUserBudgetUsd:
        req.body.perUserBudgetUsd !== undefined && req.body.perUserBudgetUsd !== null
          ? Number(req.body.perUserBudgetUsd)
          : undefined,
      resourceCleanupEnabled: req.body.resourceCleanupEnabled === true,
      resourceCleanupIntervalHours:
        req.body.resourceCleanupIntervalHours !== undefined
        && req.body.resourceCleanupIntervalHours !== null
          ? Number(req.body.resourceCleanupIntervalHours)
          : undefined,
      resourceCleanupTime:
        typeof req.body.resourceCleanupTime === 'string'
          ? req.body.resourceCleanupTime.trim()
          : undefined,
      resourceCleanupTimezone:
        typeof req.body.resourceCleanupTimezone === 'string'
          ? req.body.resourceCleanupTimezone.trim()
          : undefined,
      resourceCleanupAction:
        req.body.resourceCleanupAction === 'pause' ? 'pause' : 'delete',
      usageWindows: Array.isArray(req.body.usageWindows) ? req.body.usageWindows : undefined,
      projectName:
        typeof req.body.projectName === 'string' ? req.body.projectName.trim() : undefined,
      projectId:
        typeof req.body.projectId === 'string'
          ? req.body.projectId.trim()
          : typeof req.body.project_id === 'string'
            ? req.body.project_id.trim()
            : undefined,
      idMode:
        req.body.idMode === 'test_ids' || req.body.idMode === 'azure_ids'
          ? req.body.idMode
          : undefined,
      microsoftLicenseSkuId:
        typeof req.body.microsoftLicenseSkuId === 'string'
          ? req.body.microsoftLicenseSkuId.trim()
          : undefined,
      microsoftLicenseSkuPartNumber:
        typeof req.body.microsoftLicenseSkuPartNumber === 'string'
          ? req.body.microsoftLicenseSkuPartNumber.trim()
          : undefined,
      convertedFromRequestId:
        req.body.convertedFromRequestId !== undefined && req.body.convertedFromRequestId !== null
          ? Number(req.body.convertedFromRequestId)
          : undefined,
      purchaseToken:
        typeof req.body.purchaseToken === 'string' ? req.body.purchaseToken.trim() : undefined,
      labPermissionMode:
        req.body.labPermissionMode === 'strict' || req.body.labPermissionMode === 'standard'
          ? req.body.labPermissionMode
          : undefined
    };

    const result = await requestService.createRequest({
      ...payload,
      rackoUserId: req.rackoUser?.userId,
      portalBaseUrl: resolvePortalBaseUrlFromRequestHeaders(req.headers)
    });

    res.status(201).json({
      success: true,
      requestId: result.requestId,
      estimatedPrice: result.estimatedPrice
    });
  } catch (error) {
    next(error);
  }
};

const getAllRequests = async (req, res, next) => {
  try {
    const ownerId =
      typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : undefined;

    const requests = await requestService.getAllRequests({
      rackoUserId: req.rackoUser.userId,
      isSuperAdmin: req.rackoUser.isSuperAdmin,
      ownerId,
    });

    res.status(200).json({
      success: true,
      data: requests,
      count: requests.length
    });
  } catch (error) {
    next(error);
  }
};

const getRequestById = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const request = await requestService.getRequestById(Number(req.params.id), {
      rackoUserId: req.rackoUser.userId,
      isSuperAdmin: req.rackoUser.isSuperAdmin
    });

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
};

const updateCleanupSchedule = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const updated = await cleanupService.updateCleanupSchedule(Number(req.params.id), {
      cleanupEnabled: req.body.cleanupEnabled === true,
      cleanupIntervalHours:
        req.body.cleanupIntervalHours !== undefined && req.body.cleanupIntervalHours !== null
          ? Number(req.body.cleanupIntervalHours)
          : undefined
    });

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllRequests,
  createRequest,
  getRequestById,
  updateCleanupSchedule,
  validateRequestPayload
};
