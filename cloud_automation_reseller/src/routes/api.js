import { Router } from 'express';
import { requireInternalSecret } from '../middleware/requireInternalSecret.js';
import { selectProvider } from '../services/providerSelector.js';
import { provisionVm, terminateVm } from '../services/provisionOrchestrator.js';
import { syncAllPricing } from '../services/pricingSync.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';

const router = Router();

router.use(requireInternalSecret);

router.post('/select', async (req, res, next) => {
  try {
    const result = await selectProvider(req.body || {});
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/provision', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.provider || !body.canonicalSpec) {
      return res.status(400).json({
        success: false,
        message: 'provider and canonicalSpec are required',
      });
    }
    const result = await provisionVm(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/terminate', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.provider || !body.providerInstanceId) {
      return res.status(400).json({
        success: false,
        message: 'provider and providerInstanceId are required',
      });
    }
    const result = await terminateVm(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/pricing/sync', async (_req, res, next) => {
  try {
    const results = await syncAllPricing();
    res.json({ success: true, data: { results } });
  } catch (err) {
    next(err);
  }
});

router.get('/pricing', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.provider) filter.provider = String(req.query.provider);
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.canonicalSpec) filter.canonicalSpec = String(req.query.canonicalSpec);

    const rows = await CloudRegionPricing.find(filter)
      .sort({ rawTotalPricePerHr: 1 })
      .limit(Math.min(Number(req.query.limit) || 100, 500))
      .lean();

    res.json({ success: true, data: { rows, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

export default router;
