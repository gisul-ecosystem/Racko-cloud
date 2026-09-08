import { Router } from 'express';
import { requireInternalSecret } from '../middleware/requireInternalSecret.js';
import { selectProvider } from '../services/providerSelector.js';
import { provisionVm, terminateVm, powerVm } from '../services/provisionOrchestrator.js';
import { syncAllPricing } from '../services/pricingSync.js';
import { normalizeProviders } from '../config/cloudProviders.js';
import {
  searchAzureCustomImages,
  validateAzureImage,
  validateAzureCustomImage,
  validateAzureProvisionQuote,
} from '../provisioners/azure/azureCatalogLookup.js';
import { listAzurePlacementOptions } from '../provisioners/azure/azurePlacementOptions.js';
import { listAzureSubscriptionLocations } from '../provisioners/azure/azureLocations.js';
import { searchAzureMarketplaceImages } from '../provisioners/azure/azureMarketplaceBrowse.js';
import { listAzureImageSkuPlans } from '../provisioners/azure/azureImageSkuPlans.js';
import { azureConfig, validateAzureConfig } from '../config/azure.js';
import { isProvisionReady } from '../config/provisionReady.js';
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

router.post('/power', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.provider || !body.action) {
      return res.status(400).json({
        success: false,
        message: 'provider and action are required',
      });
    }
    const hasRef =
      (body.resourceGroup && body.vmName) ||
      (typeof body.providerInstanceId === 'string' && body.providerInstanceId.includes('/'));
    if (String(body.provider).toLowerCase() === 'azure' && !hasRef) {
      return res.status(400).json({
        success: false,
        message:
          'Azure power requires resourceGroup + vmName, or providerInstanceId as resourceGroup/vmName',
      });
    }
    const result = await powerVm(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/azure/provision-ready', (_req, res) => {
  const ready = isProvisionReady('azure');
  let message = null;
  if (!ready) {
    try {
      validateAzureConfig({ forProvision: true });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
  }
  res.json({
    success: true,
    data: {
      ready,
      message,
      defaultLocation: azureConfig.location || null,
      homeLocation: azureConfig.location || null,
      catalogBrowseRegion: azureConfig.location || null,
      networkResourceGroup: azureConfig.vnetResourceGroup,
      subscriptionId: azureConfig.subscriptionId || null,
      vnetName: azureConfig.vnetName || null,
      subnetName: azureConfig.subnetName || null,
    },
  });
});

router.get('/azure/locations', async (_req, res, next) => {
  try {
    const rows = await listAzureSubscriptionLocations();
    res.json({ success: true, data: { rows, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.get('/azure/marketplace/image-plans', async (req, res, next) => {
  try {
    const region = String(req.query.region || '').trim();
    const publisher = String(req.query.publisher || '').trim();
    const offer = String(req.query.offer || '').trim();
    const productDisplayName = String(req.query.productDisplayName || req.query.displayName || '').trim();
    if (!region || !publisher || !offer) {
      return res.status(400).json({
        success: false,
        message: 'region, publisher, and offer query parameters are required.',
      });
    }
    const rows = await listAzureImageSkuPlans({
      region,
      publisher,
      offer,
      productDisplayName: productDisplayName || undefined,
    });
    res.json({ success: true, data: { rows, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.get('/azure/marketplace/images', async (req, res, next) => {
  try {
    const result = await searchAzureMarketplaceImages({
      query: req.query.q ?? req.query.query ?? '',
      osType: req.query.osType ?? req.query.os ?? 'all',
      skip: req.query.skip ? Number(req.query.skip) : 0,
      take: req.query.take ?? req.query.limit ?? 24,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/azure/validate-provision-quote', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.vmSize?.trim() || !body.region?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'vmSize and region are required.',
      });
    }
    const result = await validateAzureProvisionQuote(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/azure/placement-options', async (req, res, next) => {
  try {
    const body = req.body || {};
    const needVcpu = Number(body.vcpu);
    const needRam = Number(body.ramGb);
    const needDisk = Number(body.ssdGb);
    if (!Number.isFinite(needVcpu) || needVcpu < 1) {
      return res.status(400).json({ success: false, message: 'vcpu is required.' });
    }
    if (!Number.isFinite(needRam) || needRam < 1) {
      return res.status(400).json({ success: false, message: 'ramGb is required.' });
    }
    if (!Number.isFinite(needDisk) || needDisk < 8) {
      return res.status(400).json({ success: false, message: 'ssdGb is required (minimum 8).' });
    }
    const result = await listAzurePlacementOptions({
      vcpu: needVcpu,
      ramGb: needRam,
      ssdGb: needDisk,
      category: body.category || 'linux',
      nestedVirtualization: Boolean(body.nestedVirtualization),
      assignPublicIp: Boolean(body.assignPublicIp),
      region: body.region,
      imagePublisher: body.imagePublisher,
      imageOffer: body.imageOffer,
      imageSku: body.imageSku,
    });
    res.json({
      success: true,
      data: {
        options: result.options,
        total: result.total ?? result.options.length,
        canonicalSpec: result.canonicalSpec,
        message: result.message,
        homeRegion: result.homeRegion,
        regionMode: result.regionMode,
        assignPublicIp: result.assignPublicIp,
        recommended: result.recommended ?? result.options[0] ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(message)) {
      return res.status(503).json({
        success: false,
        message:
          'Azure pricing API unreachable from reseller (network/DNS). Retry in a moment — ensure outbound HTTPS to management.azure.com and prices.azure.com is allowed.',
      });
    }
    next(err);
  }
});

router.post('/azure/validate-image', async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await validateAzureImage(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/azure/custom-images', async (req, res, next) => {
  try {
    const rows = await searchAzureCustomImages({
      query: req.query.q ?? req.query.query ?? '',
      limit: req.query.limit,
      resourceGroup: req.query.resourceGroup,
    });
    res.json({ success: true, data: { rows, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post('/azure/validate-custom-image', async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await validateAzureCustomImage(body);
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
