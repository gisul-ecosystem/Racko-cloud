import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { ociSpecMap, OCI_PRICING_REGIONS, vcpuToOcpus } from '../config/specMap.js';

const PRODUCTS_URL = 'https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/';

let productCache = null;
let productCacheAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Fallback PAYG USD rates if product list lookup fails (approximate list prices). */
const FALLBACK_RATES = {
  ocpuPerHr: 0.025,
  memoryGbPerHr: 0.0015,
  blockVolumeGbPerMonth: 0.0255,
  publicIpPerHr: 0.0005,
  windowsOcpuPerHr: 0.046,
};

function paygUsd(item) {
  const currencyBlock = (item.prices || []).find((p) => p.currencyCode === 'USD') || item.prices?.[0];
  const payg = (currencyBlock?.prices || []).find((p) => p.model === 'PAY_AS_YOU_GO');
  const value = parseFloat(payg?.value ?? 'NaN');
  return Number.isFinite(value) ? value : null;
}

async function loadProducts() {
  if (productCache && Date.now() - productCacheAt < CACHE_TTL_MS) {
    return productCache;
  }
  const url = `${PRODUCTS_URL}?currencyCode=USD`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OCI products API HTTP ${res.status}`);
  const data = await res.json();
  productCache = data.items || [];
  productCacheAt = Date.now();
  return productCache;
}

function findRate(items, predicates) {
  for (const pred of predicates) {
    const hit = items.find(pred);
    const rate = hit ? paygUsd(hit) : null;
    if (rate != null) return { rate, partNumber: hit.partNumber, displayName: hit.displayName };
  }
  return null;
}

/**
 * Resolve OCI compute/storage/IP hourly components from public list prices.
 */
export async function getOciUnitRates() {
  try {
    const items = await loadProducts();
    const ocpu = findRate(items, [
      (i) =>
        /Compute\s*-\s*Standard\s*-\s*E4\s*-\s*OCPU/i.test(i.displayName || '') &&
        /OCPU/i.test(i.metricName || ''),
      (i) =>
        /E4/i.test(i.displayName || '') &&
        /OCPU Per Hour/i.test(i.metricName || '') &&
        /Standard/i.test(i.displayName || ''),
    ]);
    const memory = findRate(items, [
      (i) =>
        /Compute\s*-\s*Standard\s*-\s*E4\s*-\s*Memory/i.test(i.displayName || '') &&
        /Gigabyte/i.test(i.metricName || ''),
      (i) =>
        /E4/i.test(i.displayName || '') &&
        /Memory/i.test(i.displayName || '') &&
        /Gigabyte/i.test(i.metricName || ''),
    ]);
    const block = findRate(items, [
      (i) =>
        /Block Volume/i.test(i.displayName || '') &&
        /Storage/i.test(i.displayName || '') &&
        /Gigabyte Storage Capacity Per Month/i.test(i.metricName || ''),
      (i) => /Block Volume - Storage/i.test(i.displayName || ''),
    ]);
    const publicIp = findRate(items, [
      (i) => /Public IP/i.test(i.displayName || '') && /Hour/i.test(i.metricName || ''),
      (i) => /Reserved Public IP/i.test(i.displayName || ''),
    ]);
    const windows = findRate(items, [
      (i) =>
        /Windows/i.test(i.displayName || '') &&
        /OCPU/i.test(i.metricName || '') &&
        /License/i.test(i.displayName || ''),
      (i) => /Microsoft Windows/i.test(i.displayName || '') && /OCPU/i.test(i.metricName || ''),
    ]);

    return {
      ocpuPerHr: ocpu?.rate ?? FALLBACK_RATES.ocpuPerHr,
      memoryGbPerHr: memory?.rate ?? FALLBACK_RATES.memoryGbPerHr,
      blockVolumeGbPerMonth: block?.rate ?? FALLBACK_RATES.blockVolumeGbPerMonth,
      publicIpPerHr: publicIp?.rate ?? FALLBACK_RATES.publicIpPerHr,
      windowsOcpuPerHr: windows?.rate ?? FALLBACK_RATES.windowsOcpuPerHr,
      source: ocpu && memory ? 'api' : 'api+fallback',
    };
  } catch (err) {
    console.warn('[ociPricing] product list failed, using fallback rates:', err.message);
    return { ...FALLBACK_RATES, source: 'fallback' };
  }
}

export function computeOciHourly({
  ocpus,
  memoryInGBs,
  bootVolumeGb,
  category = 'linux',
  rates,
}) {
  const r = rates || FALLBACK_RATES;
  let compute = Number(ocpus) * r.ocpuPerHr + Number(memoryInGBs) * r.memoryGbPerHr;
  if (category === 'windows') {
    compute += Number(ocpus) * (r.windowsOcpuPerHr || 0);
  }
  const storage = (Number(bootVolumeGb) || 0) * ((r.blockVolumeGbPerMonth || 0) / 730);
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
 * Sync OCI Flex shape prices into CloudRegionPricing for known specs.
 */
export async function syncOciPricing() {
  const rates = await getOciUnitRates();
  const now = new Date();
  let written = 0;
  const errors = [];

  for (const [canonicalSpec, mapping] of Object.entries(ociSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories = category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    for (const region of OCI_PRICING_REGIONS) {
      for (const cat of categories) {
        try {
          const priced = computeOciHourly({
            ocpus: mapping.ocpus,
            memoryInGBs: mapping.memoryInGBs,
            bootVolumeGb: mapping.bootVolumeGb,
            category: cat,
            rates,
          });

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'oci',
              region,
              category: cat,
              canonicalSpec,
            },
            {
              provider: 'oci',
              region,
              category: cat,
              canonicalSpec,
              ...priced,
              currency: 'USD',
              instanceType: `${mapping.shape}/${mapping.ocpus}ocpu/${mapping.memoryInGBs}gb`,
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

  return {
    provider: 'oci',
    written,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
    ratesSource: rates.source,
  };
}

export { vcpuToOcpus };
