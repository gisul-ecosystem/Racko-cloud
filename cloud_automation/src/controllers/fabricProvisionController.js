const AppError = require('../utils/AppError');
const fabricProvisionService = require('../services/fabricProvisionService');

const validateRequestId = (requestId) => {
  if (!/^\d+$/.test(String(requestId))) {
    throw new AppError('Request id must be a positive integer.', 400);
  }
};

const provisionFabricForRequest = async (req, res, next) => {
  try {
    validateRequestId(req.params.id);
    const result = await fabricProvisionService.provisionFabricForRequest(Number(req.params.id));
    res.status(200).json({
      success: true,
      ...result,
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
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFabricProvisionStatus,
  provisionFabricForRequest,
};
