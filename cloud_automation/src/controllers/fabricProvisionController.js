const AppError = require('../utils/AppError');
const fabricProvisionService = require('../services/fabricProvisionService');
const { runWithActiveCohort } = require('../services/cohortStepRunner');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(String(requestId))) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionFabricForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);
    const requestId = Number(req.params.id);

    const retry =
      req.body?.retry === true ||
      req.query?.retry === '1' ||
      req.query?.retry === 'true';

    const result = await runWithActiveCohort(
      requestId,
      'fabric',
      (range) => fabricProvisionService.provisionFabricForRequest(requestId, range),
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

const getFabricProvisionStatus = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);
    const result = await fabricProvisionService.getFabricProvisionStatus(Number(req.params.id));
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFabricProvisionStatus,
  provisionFabricForRequest
};
