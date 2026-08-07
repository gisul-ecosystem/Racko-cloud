const AppError = require('../utils/AppError');
const serviceResourceProvisionService = require('../services/serviceResourceProvisionService');
const { runWithActiveCohort } = require('../services/cohortStepRunner');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(requestId)) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionServiceResources = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);
    const requestId = Number(req.params.id);

    const retry =
      req.body?.retry === true ||
      req.query?.retry === '1' ||
      req.query?.retry === 'true';

    const result = await runWithActiveCohort(
      requestId,
      'services',
      (range) =>
        serviceResourceProvisionService.provisionServiceResourcesForRequest(requestId, range),
      { retry }
    );

    res.status(200).json({
      success: true,
      ...result,
      failed: result.failed === true,
      failures: result.failures || []
    });
  } catch (error) {
    next(error);
  }
};

const getProvisionedServiceResources = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const requestId = Number(req.params.id);
    const status = await serviceResourceProvisionService.getServiceProvisionStatus(requestId);

    res.status(200).json({
      success: true,
      resources: status.resources,
      count: status.count,
      complete: status.complete,
      remaining: status.remaining
    });
  } catch (error) {
    next(error);
  }
};

const repairInstancePolicies = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);

    const result = await serviceResourceProvisionService.repairInstancePoliciesForRequest(
      Number(req.params.id)
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  provisionServiceResources,
  getProvisionedServiceResources,
  repairInstancePolicies
};
