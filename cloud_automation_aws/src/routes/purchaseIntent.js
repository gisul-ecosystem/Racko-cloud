import express from 'express';
import {
  getClonePayloadByPurchaseToken,
  recordPurchaseIntentResponse,
} from '../services/purchaseIntentService.js';

const router = express.Router();

router.post('/purchase-intent/respond', async (req, res, next) => {
  try {
    const result = await recordPurchaseIntentResponse(req.body?.token, req.body?.response);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/purchase-intent/clone', async (req, res, next) => {
  try {
    const data = await getClonePayloadByPurchaseToken(req.query?.token);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
