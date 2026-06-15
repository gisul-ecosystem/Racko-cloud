const AppError = require('../utils/AppError');
const requestService = require('../services/requestService');
const { getMaxDailyLimitMinutes } = require('../utils/usageSchedule');
const { validateRequestPayload } = require('../validators/requestPayloadValidator');

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
      costingMode: req.body.costingMode
    };

    const result = await requestService.createRequest(payload);

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
    const requests = await requestService.getAllRequests();

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

    const request = await requestService.getRequestById(Number(req.params.id));

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

module.exports = {
  getAllRequests,
  createRequest,
  getRequestById,
  validateRequestPayload
};
