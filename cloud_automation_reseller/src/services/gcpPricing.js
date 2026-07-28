import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { gcpSpecMap, GCP_PRICING_REGIONS } from '../config/specMap.js';
import { gcpConfig, getGcpAccessToken, GCP_REGION_BILLING_NAMES } from '../config/gcp.js';

/** Compute Engine service id in Cloud Billing Catalog. */
const COMPUTE_SERVICE = '6F81-5844-456A';

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

function requireGcpAuth() {
  if (!gcpConfig.apiKey && !gcpConfig.keyFilename && !gcpConfig.credentials) {
    throw new Error(
      'GCP pricing requires GCP_API_KEY or GCP_SERVICE_ACCOUNT_KEY_PATH / GCP_SERVICE_ACCOUNT_KEY (Cloud Billing API enabled)'
    );
  }
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
  requireGcpAuth();

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
    throw new Error(
      'GCP pricing auth failed — set GCP_API_KEY or a valid service account for Cloud Billing Catalog'
    );
  }

  let lastStatus = 0;
  let lastBody = '';
  for (const attempt of attempts) {
    const headers = { Accept: 'application/json' };
    if (attempt.token) headers.Authorization = `Bearer ${attempt.token}`;
    const res = await fetch(attempt.url, { headers });
    lastStatus = res.status;
    if (res.ok) return res.json();
    lastBody = await res.text().catch(() => '');
  }

  throw new Error(
    `GCP Billing Catalog HTTP ${lastStatus}${lastBody ? `: ${lastBody.slice(0, 200)}` : ''}`
  );
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
    if (pages >= 40) break;
  } while (pageToken);

  if (skus.length === 0) {
    throw new Error('GCP Billing Catalog returned no Compute Engine SKUs');
  }

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

function requireRate(name, value) {
  if (value == null || !Number.isFinite(value)) {
    throw new Error(`GCP catalog missing live rate for ${name}`);
  }
  return value;
}

/**
 * Resolve E2/N1 core+RAM unit rates from live Cloud Billing Catalog for a region.
 * Throws if auth is missing or required rates cannot be resolved — no fallbacks.
 */
export async function getGcpUnitRates(region = 'asia-south1') {
  const place = GCP_REGION_BILLING_NAMES[region] || region;
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
  const n2Core = findRate(skus, [
    (s) =>
      /N2 (?:Predefined )?Instance Core/i.test(s.description || '') &&
      new RegExp(place, 'i').test(s.description || '') &&
      !/Spot|Preemptible|N2D/i.test(s.description || ''),
  ]);
  const n2Ram = findRate(skus, [
    (s) =>
      /N2 (?:Predefined )?Instance Ram/i.test(s.description || '') &&
      new RegExp(place, 'i').test(s.description || '') &&
      !/Spot|Preemptible|N2D/i.test(s.description || ''),
  ]);
  const pdBalanced = findRate(skus, [
    (s) =>
      /Balanced PD Capacity/i.test(s.description || '') &&
      new RegExp(place, 'i').test(s.description || ''),
    (s) => /Balanced PD Capacity/i.test(s.description || ''),
  ]);
  const pdStandard = findRate(skus, [
    (s) =>
      /Standard PD Capacity/i.test(s.description || '') &&
      new RegExp(place, 'i').test(s.description || ''),
    (s) => /Standard PD Capacity/i.test(s.description || ''),
  ]);
  const ip = findRate(skus, [
    (s) => /Static Ip Charge/i.test(s.description || '') && /In Use/i.test(s.description || ''),
    (s) => /External IP Charge.*In Use/i.test(s.description || ''),
  ]);
  const windows = findRate(skus, [
    (s) =>
      /Windows Server/i.test(s.description || '') &&
      /Core/i.test(s.description || '') &&
      !/Spot|Preemptible/i.test(s.description || ''),
    (s) => /Licensing Fee for Windows Server/i.test(s.description || ''),
  ]);
  const t4Gpu = findRate(skus, [
    (s) =>
      /Nvidia Tesla T4/i.test(s.description || '') &&
      /GPU/i.test(s.description || '') &&
      new RegExp(place, 'i').test(s.description || '') &&
      !/Spot|Preemptible/i.test(s.description || ''),
    (s) =>
      /Nvidia Tesla T4 Gpu/i.test(s.description || '') &&
      !/Spot|Preemptible/i.test(s.description || ''),
  ]);

  return {
    e2CorePerHr: requireRate(`E2 core (${place})`, e2Core),
    e2RamGbPerHr: requireRate(`E2 RAM (${place})`, e2Ram),
    n1CorePerHr: requireRate(`N1 core (${place})`, n1Core),
    n1RamGbPerHr: requireRate(`N1 RAM (${place})`, n1Ram),
    n2CorePerHr: n2Core,
    n2RamGbPerHr: n2Ram,
    pdBalancedGbPerMonth: requireRate(`Balanced PD (${place})`, pdBalanced),
    pdStandardGbPerMonth: requireRate(`Standard PD (${place})`, pdStandard),
    publicIpPerHr: requireRate('Public IP in-use', ip),
    windowsCorePerHr: windows,
    t4GpuPerHr: t4Gpu,
    source: 'api',
  };
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
  throw new Error(`Unknown GCP machine type for pricing: ${machineType}`);
}

export function computeGcpHourly({
  machineType,
  diskGb,
  diskType = 'standard_ssd',
  category = 'linux',
  acceleratorCount = 0,
  rates,
} = {}) {
  if (!rates || rates.source === 'fallback') {
    throw new Error('GCP hourly compute requires live catalog rates (no fallback)');
  }

  const res = machineResources(machineType);
  let coreRate;
  let ramRate;
  if (res.family === 'n2') {
    if (rates.n2CorePerHr == null || rates.n2RamGbPerHr == null) {
      throw new Error('GCP catalog missing live N2 core/RAM rates');
    }
    coreRate = rates.n2CorePerHr;
    ramRate = rates.n2RamGbPerHr;
  } else if (res.family === 'n1' || res.family === 'g2') {
    coreRate = rates.n1CorePerHr;
    ramRate = rates.n1RamGbPerHr;
  } else {
    coreRate = rates.e2CorePerHr;
    ramRate = rates.e2RamGbPerHr;
  }

  let compute = Number(res.vcpu) * coreRate + Number(res.ramGb) * ramRate;
  if (category === 'windows') {
    if (rates.windowsCorePerHr == null) {
      throw new Error('GCP catalog missing Windows Server core license rate');
    }
    compute += Number(res.vcpu) * rates.windowsCorePerHr;
  }
  if (acceleratorCount > 0) {
    if (rates.t4GpuPerHr == null) {
      throw new Error('GCP catalog missing NVIDIA T4 GPU rate');
    }
    compute += Number(acceleratorCount) * rates.t4GpuPerHr;
  }
  const diskGbMonth =
    diskType === 'standard_hdd' ? rates.pdStandardGbPerMonth : rates.pdBalancedGbPerMonth;
  const storage = (Number(diskGb) || 0) * (diskGbMonth / 730);
  const ip = rates.publicIpPerHr;
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
 * Sync GCP Compute prices into CloudRegionPricing for known specs (live catalog only).
 */
export async function syncGcpPricing() {
  const now = new Date();
  let written = 0;
  const errors = [];
  const ratesByRegion = {};

  try {
    requireGcpAuth();
  } catch (err) {
    return {
      provider: 'gcp',
      written: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      errorCount: 1,
      ratesSource: 'skipped',
    };
  }

  for (const region of GCP_PRICING_REGIONS) {
    try {
      ratesByRegion[region] = await getGcpUnitRates(region);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${region}: ${msg}`);
      ratesByRegion[region] = null;
    }
  }

  for (const [canonicalSpec, mapping] of Object.entries(gcpSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories = category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    for (const region of GCP_PRICING_REGIONS) {
      const rates = ratesByRegion[region];
      if (!rates) continue;

      for (const cat of categories) {
        try {
          const priced = computeGcpHourly({
            machineType: mapping.machineType,
            diskGb: mapping.diskGb,
            category: cat,
            acceleratorCount: mapping.acceleratorCount || 0,
            rates,
          });

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'gcp',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
            },
            {
              provider: 'gcp',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
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

  const sources = [
    ...new Set(
      Object.values(ratesByRegion)
        .filter(Boolean)
        .map((r) => r.source)
    ),
  ];

  return {
    provider: 'gcp',
    written,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
    ratesSource: sources.length ? sources.join(',') : 'skipped',
  };
}
