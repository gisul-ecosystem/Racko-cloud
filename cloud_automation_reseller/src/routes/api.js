import { Router } from 'express';
import { requireInternalSecret } from '../middleware/requireInternalSecret.js';
import { selectProvider } from '../services/providerSelector.js';
import { provisionVm, terminateVm } from '../services/provisionOrchestrator.js';
import { syncAllPricing } from '../services/pricingSync.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import CloudRegionPricing, {
  toPricingMode,
  pricingModeQuery,
} from '../models/CloudRegionPricing.js';

const router = Router();

router.use(requireInternalSecret);

router.post('/select', async (req, res, next) => {
  try {
    const body = req.body || {};
    const providers = body.providers ?? body.provider;
    const result = await selectProvider({
      ...body,
      ...(providers !== undefined ? { providers } : {}),
    });
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

router.post('/pricing/sync', async (req, res, next) => {
  try {
    const body = req.body || {};
    const providers = body.providers ?? body.provider;
    const { providersUsed, results } = await syncAllPricing(
      providers !== undefined ? { providers } : {}
    );
    res.json({ success: true, data: { providersUsed, results } });
  } catch (err) {
    next(err);
  }
});

router.get('/pricing', async (req, res, next) => {
  try {
    const mode =
      req.query.pricingMode === 'nested' || req.query.pricingMode === 'normal'
        ? req.query.pricingMode
        : toPricingMode(req.query.nestedVirtualization);

    const filter = {
      ...pricingModeQuery(mode),
    };
    if (req.query.providers) {
      filter.provider = { $in: normalizeProviders(String(req.query.providers)) };
    } else if (req.query.provider) {
      filter.provider = String(req.query.provider);
    }
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
