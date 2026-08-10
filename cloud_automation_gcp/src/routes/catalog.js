import { Router } from 'express';
import ServiceCategory from '../models/ServiceCategory.js';
import Service from '../models/Service.js';
import ServicePricing from '../models/ServicePricing.js';
import { listRegionNames } from '../services/catalogSeedService.js';
import { getAvailableRegions } from '../services/gcpPricingService.js';
import { getPricingForServiceRoute, calculateEstimate } from '../services/pricingService.js';
import { syncGcpCatalog } from '../services/catalogSyncService.js';

const router = Router();

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await ServiceCategory.find().sort({ name: 1 }).lean();
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

router.get('/services', async (req, res, next) => {
  try {
    const { category, region } = req.query;
    const filter = {};

    if (category) {
      const categoryDoc = await ServiceCategory.findOne({ name: category }).lean();
      if (!categoryDoc) return res.json({ success: true, services: [] });
      filter.categoryId = categoryDoc._id;
    }

    let services = await Service.find(filter).populate('categoryId').sort({ name: 1 }).lean();

    if (region) {
      const pricedServiceIds = await ServicePricing.distinct('serviceId', { region });
      const pricedSet = new Set(pricedServiceIds.map(String));
      services = services.filter((service) => pricedSet.has(String(service._id)));
    }

    res.json({ success: true, services });
  } catch (err) {
    next(err);
  }
});

router.get('/pricing', async (req, res, next) => {
  try {
    const { serviceId, region } = req.query;
    if (!serviceId || !region) {
      return res.status(400).json({
        success: false,
        message: 'serviceId and region query parameters are required',
      });
    }

    const pricing = await getPricingForServiceRoute(serviceId, region);
    const service = await Service.findById(serviceId).lean();

    res.json({
      success: true,
      pricing: pricing.map((entry) => ({
        instanceType: entry.instanceType,
        pricePerHour: entry.pricePerHour,
        pricePerDay: entry.pricePerDay,
        priceUnit: entry.priceUnit,
        unitPrice: entry.unitPrice ?? 0,
        flatRate: service?.pricingType === 'flat_rate',
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/regions', async (_req, res, next) => {
  try {
    res.json({ success: true, regions: listRegionNames() });
  } catch (err) {
    next(err);
  }
});

router.get('/available-regions', async (req, res, next) => {
  try {
    const { serviceIds, instanceSelections } = req.query;
    if (!serviceIds) {
      return res.status(400).json({
        success: false,
        message: 'serviceIds query parameter is required',
      });
    }

    const regions = await getAvailableRegions(serviceIds, instanceSelections);
    res.json({ success: true, regions });
  } catch (err) {
    next(err);
  }
});

router.post('/pricing/estimate', async (req, res, next) => {
  try {
    const {
      serviceIds = [],
      region,
      accountCount,
      durationDays,
      instanceSelections = [],
      startDate,
      endDate,
      usageWindows = [],
      costingMode = 'shared',
    } = req.body;

    if (!region || !Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'serviceIds and region are required',
      });
    }

    const estimate = await calculateEstimate({
      serviceIds,
      region,
      accountCount: Number(accountCount) || 0,
      durationDays: Number(durationDays) || 0,
      instanceSelections,
      startDate,
      endDate,
      usageWindows,
      costingMode,
    });

    res.json({ success: true, ...estimate });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/sync-services', async (req, res, next) => {
  try {
    const results = await syncGcpCatalog();
    res.json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
});

export default router;
