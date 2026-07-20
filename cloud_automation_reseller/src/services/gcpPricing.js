import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { gcpSpecMap, GCP_PRICING_REGIONS } from '../config/specMap.js';
import { gcpConfig, getGcpAccessToken, GCP_REGION_BILLING_NAMES } from '../config/gcp.js';

/** Compute Engine service id in Cloud Billing Catalog. */
const COMPUTE_SERVICE = '6F81-5844-456A';

/** Approximate PAYG USD rates if catalog lookup fails (E2-class, global-ish). */
const FALLBACK_RATES = {
  e2CorePerHr: 0.021811,
  e2RamGbPerHr: 0.002923,
  n1CorePerHr: 0.031611,
  n1RamGbPerHr: 0.004237,
  pdBalancedGbPerMonth: 0.1,
  publicIpPerHr: 0.004,
  windowsCorePerHr: 0.046,
  t4GpuPerHr: 0.35,
};

const MACHINE_RESOURCES = {
  'e2-micro': { vcpu: 0.25, ramGb: 1, family: 'e2' },
  'e2-small': { vcpu: 0.5, ramGb: 2, family: 'e2' },
  'e2-medium': { vcpu: 1, ramGb: 4, family: 'e2' },
  'e2-standard-2': { vcpu: 2, ramGb: 8, family: 'e2' },
  'e2-standard-4': { vcpu: 4, ramGb: 16, family: 'e2' },
  'e2-standard-8': { vcpu: 8, ramGb: 32, family: 'e2' },
  'e2-standard-16': { vcpu: 16, ramGb: 64, family: 'e2' },
  'e2-standard-32': { vcpu: 32, ramGb: 128, family: 'e2' },
  'n1-standard-4': { vcpu: 4, ramGb: 15, family: 'n1' },
  'n1-standard-8': { vcpu: 8, ramGb: 30, family: 'n1' },
  'g2-standard-4': { vcpu: 4, ramGb: 16, family: 'g2' },
};

let skuCache = null;
let skuCacheAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function unitPriceUsd(sku) {
  const expr = sku?.pricingInfo?.[0]?.pricingExpression;
  const tier = expr?.tieredRates?.[0];
  const nanos = Number(tier?.unitPrice?.nanos || 0);
  const units = Number(tier?.unitPrice?.units || 0);
  const value = units + nanos / 1e9;
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchCatalogPage(pageToken) {
  const buildUrl = (includeApiKey) => {
    const url = new URL(
      `https://cloudbilling.googleapis.com/v1/services/${COMPUTE_SERVICE}/skus`
    );
    url.searchParams.set('currencyCode', 'USD');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    if (includeApiKey && gcpConfig.apiKey) url.searchParams.set('key', gcpConfig.apiKey);
    return url.toString();
  };

  const attempts = [];
  if (gcpConfig.apiKey) {
    attempts.push({ label: 'apiKey', url: buildUrl(true) });
  }
  const token = await getGcpAccessToken();
  if (token) {
    attempts.push({ label: 'oauth', url: buildUrl(false), token });
  }
  if (attempts.length === 0) {
    attempts.push({ label: 'anonymous', url: buildUrl(false) });
  }

  let lastStatus = 0;
  for (const attempt of attempts) {
    const headers = { Accept: 'application/json' };
    if (attempt.token) headers.Authorization = `Bearer ${attempt.token}`;
    const res = await fetch(attempt.url, { headers });
    lastStatus = res.status;
    if (res.ok) return res.json();
    if (attempt.label === 'anonymous' && res.status === 403) {
      console.warn(
        '[gcpPricing] Billing Catalog requires GCP_API_KEY or GCP_SERVICE_ACCOUNT_KEY_PATH (Cloud Billing API enabled)'
      );
    }
  }

  throw new Error(`GCP Billing Catalog HTTP ${lastStatus}`);
}

async function loadComputeSkus() {
  if (skuCache && Date.now() - skuCacheAt < CACHE_TTL_MS) return skuCache;

  const skus = [];
  let pageToken = '';
  let pages = 0;
  do {
    const data = await fetchCatalogPage(pageToken || undefined);
    skus.push(...(data.skus || []));
    pageToken = data.nextPageToken || '';
    pages += 1;
    // Cap pages so sync stays responsive (~100 SKUs/page).
    if (pages >= 40) break;
  } while (pageToken);

  skuCache = skus;
  skuCacheAt = Date.now();
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

/**
 * Resolve E2/N1 core+RAM unit rates from catalog for a region (uses Mumbai/Iowa etc. name).
 */
export async function getGcpUnitRates(region = 'asia-south1') {
  const place = GCP_REGION_BILLING_NAMES[region] || region;
  try {
    const skus = await loadComputeSkus();
    const e2Core = findRate(skus, [
      (s) =>
        /E2 Instance Core/i.test(s.description || '') &&
        new RegExp(place, 'i').test(s.description || '') &&
        !/Spot|Preemptible/i.test(s.description || ''),
    ]);
    const e2Ram = findRate(skus, [
      (s) =>
        /E2 Instance Ram/i.test(s.description || '') &&
        new RegExp(place, 'i').test(s.description || '') &&
        !/Spot|Preemptible/i.test(s.description || ''),
    ]);
    const n1Core = findRate(skus, [
      (s) =>
        /N1 Predefined Instance Core/i.test(s.description || '') &&
        new RegExp(place, 'i').test(s.description || '') &&
        !/Spot|Preemptible/i.test(s.description || ''),
    ]);
    const n1Ram = findRate(skus, [
      (s) =>
        /N1 Predefined Instance Ram/i.test(s.description || '') &&
        new RegExp(place, 'i').test(s.description || '') &&
        !/Spot|Preemptible/i.test(s.description || ''),
    ]);
    const pd = findRate(skus, [
      (s) =>
        /Balanced PD Capacity/i.test(s.description || '') &&
        new RegExp(place, 'i').test(s.description || ''),
      (s) => /Storage PD Capacity/i.test(s.description || '') && /SSD/i.test(s.description || ''),
    ]);
    const ip = findRate(skus, [
      (s) => /Static Ip Charge/i.test(s.description || '') && /In Use/i.test(s.description || ''),
      (s) => /External IP Charge.*In Use/i.test(s.description || ''),
    ]);

    return {
      e2CorePerHr: e2Core ?? FALLBACK_RATES.e2CorePerHr,
      e2RamGbPerHr: e2Ram ?? FALLBACK_RATES.e2RamGbPerHr,
      n1CorePerHr: n1Core ?? FALLBACK_RATES.n1CorePerHr,
      n1RamGbPerHr: n1Ram ?? FALLBACK_RATES.n1RamGbPerHr,
      pdBalancedGbPerMonth: pd ?? FALLBACK_RATES.pdBalancedGbPerMonth,
      publicIpPerHr: ip ?? FALLBACK_RATES.publicIpPerHr,
      windowsCorePerHr: FALLBACK_RATES.windowsCorePerHr,
      t4GpuPerHr: FALLBACK_RATES.t4GpuPerHr,
      source: e2Core && e2Ram ? 'api' : 'api+fallback',
    };
  } catch (err) {
    console.warn('[gcpPricing] catalog failed, using fallback rates:', err.message);
    return { ...FALLBACK_RATES, source: 'fallback' };
  }
}

export function machineResources(machineType) {
  if (MACHINE_RESOURCES[machineType]) return MACHINE_RESOURCES[machineType];
  const m = String(machineType || '').match(/^(e2|n1|n2|c2|g2)-standard-(\d+)$/i);
  if (m) {
    const vcpu = Number(m[2]);
    const family = m[1].toLowerCase();
    const ramPerVcpu = family === 'n1' ? 3.75 : 4;
    return { vcpu, ramGb: vcpu * ramPerVcpu, family };
  }
  return { vcpu: 2, ramGb: 8, family: 'e2' };
}

export function computeGcpHourly({
  machineType,
  diskGb,
  category = 'linux',
  acceleratorCount = 0,
  rates,
} = {}) {
  const r = rates || FALLBACK_RATES;
  const res = machineResources(machineType);
  const coreRate = res.family === 'n1' || res.family === 'g2' ? r.n1CorePerHr : r.e2CorePerHr;
  const ramRate = res.family === 'n1' || res.family === 'g2' ? r.n1RamGbPerHr : r.e2RamGbPerHr;

  let compute = Number(res.vcpu) * coreRate + Number(res.ramGb) * ramRate;
  if (category === 'windows') {
    compute += Number(res.vcpu) * (r.windowsCorePerHr || 0);
  }
  if (acceleratorCount > 0) {
    compute += Number(acceleratorCount) * (r.t4GpuPerHr || 0);
  }
  const storage = (Number(diskGb) || 0) * ((r.pdBalancedGbPerMonth || 0) / 730);
  const ip = r.publicIpPerHr || 0;
  return {
    rawComputePricePerHr: compute,
    rawStoragePricePerHr: storage,
    rawIpPricePerHr: ip,
    rawTotalPricePerHr: compute + storage + ip,
  };
}

function categoryForSpec(canonicalSpec) {
  return canonicalSpec.includes('-gpu') ? 'gpu' : 'linux';
}

/**
 * Sync GCP Compute prices into CloudRegionPricing for known specs.
 */
export async function syncGcpPricing() {
  const now = new Date();
  let written = 0;
  const errors = [];
  const ratesByRegion = {};

  for (const region of GCP_PRICING_REGIONS) {
    ratesByRegion[region] = await getGcpUnitRates(region);
  }

  for (const [canonicalSpec, mapping] of Object.entries(gcpSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories = category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    for (const region of GCP_PRICING_REGIONS) {
      for (const cat of categories) {
        try {
          const priced = computeGcpHourly({
            machineType: mapping.machineType,
            diskGb: mapping.diskGb,
            category: cat,
            acceleratorCount: mapping.acceleratorCount || 0,
            rates: ratesByRegion[region],
          });

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'gcp',
              region,
              category: cat,
              canonicalSpec,
            },
            {
              provider: 'gcp',
              region,
              category: cat,
              canonicalSpec,
              ...priced,
              currency: 'USD',
              instanceType: mapping.machineType,
              fetchedAt: now,
              source: 'api',
            },
            { upsert: true, new: true }
          );
          written += 1;
        } catch (err) {
          errors.push(
            `${canonicalSpec}@${region}/${cat}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  const sources = [...new Set(Object.values(ratesByRegion).map((r) => r.source))];
  return {
    provider: 'gcp',
    written,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
    ratesSource: sources.join(','),
  };
}
