const purchaseIntentService = require('../services/purchaseIntentService');

const respondToPurchaseIntent = async (req, res, next) => {
  try {
    const result = await purchaseIntentService.recordPurchaseIntentResponse(
      req.body?.token || req.query?.token,
      req.body?.response || req.query?.response
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

const getPurchaseClonePayload = async (req, res, next) => {
  try {
    const payload = await purchaseIntentService.getClonePayloadByPurchaseToken(
      req.query?.token || req.params?.token
    );

    res.status(200).json({
      success: true,
      data: payload
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  respondToPurchaseIntent,
  getPurchaseClonePayload
};
