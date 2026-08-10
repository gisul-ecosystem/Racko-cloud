import Service from '../models/Service.js';
import ServicePricing from '../models/ServicePricing.js';
import {
  COMPUTE_MACHINE_TYPES,
  MACHINE_RESOURCES,
} from '../config/serviceCatalog.js';
import {
  formatFlatRateLabOption,
  getFlatRateLabTier,
  getFlatRateLabTiers,
} from '../config/flatRateLabPricing.js';
import { gcpConfig, getGcpAccessToken, GCP_REGION_BILLING_NAMES, hasGcpPricingAuth } from '../config/gcp.js';

const COMPUTE_BILLING_SERVICE = '6F81-5844-456A';
const pricingCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const computeSkuCache = new Map();

function cacheKey(serviceName, instanceType, region) {
  return `${serviceName}:${instanceType || 'flat'}:${region}`;
}

function readCache(key) {
  const entry = pricingCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    pricingCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  pricingCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function unitPriceUsd(sku) {
  const expr = sku?.pricingInfo?.[0]?.pricingExpression;
  const tier = expr?.tieredRates?.[0];
  const nanos = Number(tier?.unitPrice?.nanos || 0);
  const units = Number(tier?.unitPrice?.units || 0);
  const value = units + nanos / 1e9;
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchCatalogPage(pageToken) {
  if (!hasGcpPricingAuth()) return null;
  const buildUrl = (includeApiKey) => {
    const url = new URL(
      `https://cloudbilling.googleapis.com/v1/services/${COMPUTE_BILLING_SERVICE}/skus`
    );
    url.searchParams.set('currencyCode', 'USD');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    if (includeApiKey && gcpConfig.apiKey) url.searchParams.set('key', gcpConfig.apiKey);
    return url.toString();
  };

  const attempts = [];
  if (gcpConfig.apiKey) attempts.push({ url: buildUrl(true) });
  const token = await getGcpAccessToken();
  if (token) attempts.push({ url: buildUrl(false), token });

  if (attempts.length === 0) return null;

  for (const attempt of attempts) {
    const headers = { Accept: 'application/json' };
    if (attempt.token) headers.Authorization = `Bearer ${attempt.token}`;
    const res = await fetch(attempt.url, { headers });
    if (res.ok) return res.json();
  }
  return null;
}

async function loadComputeSkus() {
  const cached = computeSkuCache.get('skus');
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const skus = [];
  let pageToken = '';
  let pages = 0;
  do {
    const data = await fetchCatalogPage(pageToken || undefined);
    if (!data) break;
    skus.push(...(data.skus || []));
    pageToken = data.nextPageToken || '';
    pages += 1;
  } while (pageToken && pages < 40);

  if (skus.length > 0) {
    computeSkuCache.set('skus', { value: skus, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return skus;
}

function findRate(skus, predicates) {
  for (const pred of predicates) {
    const hit = skus.find(pred);
    const rate = hit ? unitPriceUsd(hit) : null;
    if (rate != null) return rate;
  }
  return null;
}

function computeEngineHourly(skus, machineType, region) {
  const place = GCP_REGION_BILLING_NAMES[region] || region;
  const spec = MACHINE_RESOURCES[machineType];
  if (!spec) return null;

  const coreRate = findRate(skus, [
    (s) =>
      s.description?.includes('E2 Instance Core') &&
      s.description?.includes(place) &&
      !s.description?.includes('Preemptible'),
    (s) =>
      s.description?.includes('N1 Predefined Instance Core') &&
      s.description?.includes(place) &&
      !s.description?.includes('Preemptible'),
  ]);

  const ramRate = findRate(skus, [
    (s) =>
      s.description?.includes('E2 Instance Ram') &&
      s.description?.includes(place) &&
      !s.description?.includes('Preemptible'),
    (s) =>
      s.description?.includes('N1 Predefined Instance Ram') &&
      s.description?.includes(place) &&
      !s.description?.includes('Preemptible'),
  ]);

  if (coreRate == null || ramRate == null) return null;

  const hourly = coreRate * spec.vcpu + ramRate * spec.ramGb;
  return Number(hourly.toFixed(6));
}

export function resolveInstanceTypeForService(service, selections = {}) {
  const selected = selections[String(service._id)];
  if (selected) return selected;

  const defaults = {
    'Compute Engine': 'e2-standard-2',
    'Cloud SQL': 'db-f1-micro',
    GKE: 'gke-small',
    'Vertex AI': 'n1-standard-4',
    Dataproc: 'dataproc-n1-standard-2',
    Memorystore: 'redis-basic-m1',
    Bigtable: 'bigtable-1-node',
    'Cloud Spanner': 'spanner-1-node',
    Filestore: 'filestore-basic-1tb',
  };

  return defaults[service.name] || 'default';
}

async function getSeededPricing(service, instanceType, region) {
  const pricing = await ServicePricing.findOne({
    serviceId: service._id,
    region,
    instanceType,
  }).lean();

  if (pricing) {
    return {
      instanceType: pricing.instanceType,
      pricePerHour: pricing.pricePerHour,
      pricePerDay: pricing.pricePerDay,
      priceUnit: pricing.priceUnit || 'hour',
      unitPrice: pricing.unitPrice ?? pricing.pricePerHour,
      flatRate: service.pricingType === 'flat_rate',
      estimated: false,
    };
  }

  const fallback = await ServicePricing.findOne({ serviceId: service._id, region })
    .sort({ pricePerHour: 1 })
    .lean();

  if (!fallback) return null;

  return {
    instanceType: fallback.instanceType,
    pricePerHour: fallback.pricePerHour,
    pricePerDay: fallback.pricePerDay,
    priceUnit: fallback.priceUnit || 'hour',
    unitPrice: fallback.unitPrice ?? fallback.pricePerHour,
    flatRate: service.pricingType === 'flat_rate',
    estimated: true,
  };
}

export async function getLivePricingForService(service, instanceType, regionCode) {
  const key = cacheKey(service.name, instanceType, regionCode);
  const cached = readCache(key);
  if (cached) return cached;

  if (service.pricingType === 'flat_rate') {
    const tier =
      getFlatRateLabTier(service.name, instanceType) ||
      getFlatRateLabTiers(service.name)[0];
    if (tier) {
      const formatted = formatFlatRateLabOption(tier);
      writeCache(key, formatted);
      return formatted;
    }
  }

  if (service.name === 'Compute Engine' && COMPUTE_MACHINE_TYPES.includes(instanceType)) {
    const skus = await loadComputeSkus();
    if (skus.length > 0) {
      const hourly = computeEngineHourly(skus, instanceType, regionCode);
      if (hourly != null) {
        const result = {
          instanceType,
          pricePerHour: hourly,
          pricePerDay: Number((hourly * 24).toFixed(4)),
          priceUnit: 'hour',
          unitPrice: hourly,
          flatRate: false,
          estimated: false,
        };
        writeCache(key, result);
        return result;
      }
    }
  }

  const seeded = await getSeededPricing(service, instanceType, regionCode);
  if (seeded) {
    writeCache(key, seeded);
    return seeded;
  }

  return null;
}

export async function getLivePricingOptions(serviceId, regionCode) {
  const service = await Service.findById(serviceId).lean();
  if (!service) return [];

  if (service.pricingType === 'flat_rate') {
    return getFlatRateLabTiers(service.name).map(formatFlatRateLabOption);
  }

  const dbOptions = await ServicePricing.find({ serviceId, region: regionCode })
    .sort({ pricePerHour: 1 })
    .lean();

  const options = [];
  for (const row of dbOptions) {
    const live = await getLivePricingForService(service, row.instanceType, regionCode);
    if (live) options.push(live);
  }

  if (options.length === 0 && service.name === 'Compute Engine') {
    for (const machineType of COMPUTE_MACHINE_TYPES) {
      const live = await getLivePricingForService(service, machineType, regionCode);
      if (live) options.push(live);
    }
  }

  return options;
}
