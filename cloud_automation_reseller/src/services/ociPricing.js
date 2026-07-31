import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { ociSpecMap, OCI_PRICING_REGIONS, vcpuToOcpus } from '../config/specMap.js';

const PRODUCTS_URL = 'https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/';

function paygUsd(item) {
  const localizations =
    item.currencyCodeLocalizations ||
    (item.prices ? [{ currencyCode: 'USD', prices: item.prices }] : []);
  const currencyBlock =
    localizations.find((p) => p.currencyCode === 'USD') || localizations[0];
  const payg = (currencyBlock?.prices || []).find((p) => p.model === 'PAY_AS_YOU_GO');
  const value = parseFloat(payg?.value ?? 'NaN');
  return Number.isFinite(value) ? value : null;
}

async function loadProducts() {
  const url = `${PRODUCTS_URL}?currencyCode=USD`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OCI products API HTTP ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

function findRate(items, predicates) {
  for (const pred of predicates) {
    const hit = items.find(pred);
    const rate = hit ? paygUsd(hit) : null;
    if (rate != null) return { rate, partNumber: hit.partNumber, displayName: hit.displayName };
  }
  return null;
}

function requireRate(name, hit) {
  if (!hit || hit.rate == null || !Number.isFinite(hit.rate)) {
    throw new Error(`OCI products API missing live rate for ${name}`);
  }
  return hit.rate;
}

/**
 * Map Flex shape → list-price family.
 * VM.Standard3.Flex meters as Compute - Standard - X9.
 * VM.Standard.E4.Flex meters as Compute - Standard - E4.
 */
export function ociShapeFamily(shape) {
  const s = String(shape || '');
  if (/Standard3|Standard\.X9|X9/i.test(s)) return 'x9';
  if (/E4/i.test(s)) return 'e4';
  if (/E5/i.test(s)) return 'e5';
  return 'e4';
}

function ocpuMemoryPredicates(family) {
  if (family === 'x9') {
    return {
      label: 'Standard X9 (Standard3.Flex)',
      ocpu: [
        (i) =>
          /Compute\s*-\s*Standard\s*-\s*X9\s*-\s*OCPU/i.test(i.displayName || '') &&
          /OCPU/i.test(i.metricName || ''),
        (i) =>
          /Standard\s*-\s*X9/i.test(i.displayName || '') &&
          /OCPU Per Hour/i.test(i.metricName || '') &&
          !/Optimized|Dense/i.test(i.displayName || ''),
      ],
      memory: [
        (i) =>
          /Compute\s*-\s*Standard\s*-\s*X9\s*-\s*Memory/i.test(i.displayName || '') &&
          /Gigabyte/i.test(i.metricName || ''),
        (i) =>
          /Standard\s*-\s*X9/i.test(i.displayName || '') &&
          /Memory/i.test(i.displayName || '') &&
          /Gigabyte/i.test(i.metricName || '') &&
          !/Optimized|Dense/i.test(i.displayName || ''),
      ],
    };
  }

  // Default / E4
  return {
    label: 'Standard E4',
    ocpu: [
      (i) =>
        /Compute\s*-\s*Standard\s*-\s*E4\s*-\s*OCPU/i.test(i.displayName || '') &&
        /OCPU/i.test(i.metricName || ''),
      (i) =>
        /E4/i.test(i.displayName || '') &&
        /OCPU Per Hour/i.test(i.metricName || '') &&
        /Standard/i.test(i.displayName || '') &&
        !/Dense|GPU|VMware/i.test(i.displayName || ''),
    ],
    memory: [
      (i) =>
        /Compute\s*-\s*Standard\s*-\s*E4\s*-+\s*Memory/i.test(i.displayName || '') &&
        /Gigabyte/i.test(i.metricName || ''),
      (i) =>
        /E4/i.test(i.displayName || '') &&
        /Memory/i.test(i.displayName || '') &&
        /Gigabyte/i.test(i.metricName || '') &&
        /Standard/i.test(i.displayName || '') &&
        !/Dense|GPU|VMware/i.test(i.displayName || ''),
    ],
  };
}

/**
 * Resolve OCI compute/storage/IP unit rates from public list prices only.
 * @param {{ shape?: string }} [opts]
 * @throws if required rates cannot be resolved from the products API
 */
export async function getOciUnitRates({ shape } = {}) {
  const family = ociShapeFamily(shape);
  const preds = ocpuMemoryPredicates(family);
  const items = await loadProducts();

  const ocpu = findRate(items, preds.ocpu);
  const memory = findRate(items, preds.memory);
  const block = findRate(items, [
    (i) =>
      /^Storage\s*-\s*Block Volume\s*-\s*Storage$/i.test(i.displayName || '') &&
      /Gigabyte Storage Capacity Per Month/i.test(i.metricName || ''),
    (i) =>
      /Block Volume\s*-\s*Storage/i.test(i.displayName || '') &&
      /Gigabyte Storage Capacity Per Month/i.test(i.metricName || '') &&
      !/Free|Performance Units|Cloud@Customer/i.test(i.displayName || ''),
  ]);
  const publicIp = findRate(items, [
    (i) => /Public IP/i.test(i.displayName || '') && /Hour/i.test(i.metricName || ''),
    (i) => /Reserved Public IP/i.test(i.displayName || ''),
    (i) => /IPv4/i.test(i.displayName || '') && /Address/i.test(i.displayName || ''),
  ]);
  const windows = findRate(items, [
    (i) =>
      /Compute\s*-\s*Windows OS/i.test(i.displayName || '') && /OCPU/i.test(i.metricName || ''),
    (i) =>
      /Windows/i.test(i.displayName || '') &&
      /OCPU/i.test(i.metricName || '') &&
      /License|OS/i.test(i.displayName || ''),
  ]);

  return {
    family,
    shape: shape || null,
    ocpuPerHr: requireRate(`${preds.label} OCPU`, ocpu),
    memoryGbPerHr: requireRate(`${preds.label} Memory`, memory),
    blockVolumeGbPerMonth: requireRate('Block Volume Storage', block),
    // Public IP is often absent from the public products feed — do not invent a rate.
    publicIpPerHr: publicIp?.rate ?? 0,
    windowsOcpuPerHr: windows?.rate ?? null,
    source: 'api',
    publicIpSource: publicIp ? 'api' : 'absent_from_catalog',
  };
}

export function computeOciHourly({
  ocpus,
  memoryInGBs,
  bootVolumeGb,
  category = 'linux',
  rates,
}) {
  if (!rates || rates.source !== 'api') {
    throw new Error('OCI hourly compute requires live products API rates (no fallback)');
  }

  let compute = Number(ocpus) * rates.ocpuPerHr + Number(memoryInGBs) * rates.memoryGbPerHr;
  if (category === 'windows') {
    if (rates.windowsOcpuPerHr == null) {
      throw new Error('OCI products API missing Windows OS OCPU license rate');
    }
    compute += Number(ocpus) * rates.windowsOcpuPerHr;
  }
  const storage = (Number(bootVolumeGb) || 0) * (rates.blockVolumeGbPerMonth / 730);
  const ip = rates.publicIpPerHr || 0;
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
  const now = Date.now();
  let written = 0;
  const errors = [];
  const ratesByFamily = {};

  async function ratesForShape(shape) {
    const family = ociShapeFamily(shape);
    if (!ratesByFamily[family]) {
      ratesByFamily[family] = await getOciUnitRates({ shape });
    }
    return ratesByFamily[family];
  }

  for (const [canonicalSpec, mapping] of Object.entries(ociSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories = category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    let rates;
    try {
      rates = await ratesForShape(mapping.shape);
    } catch (err) {
      errors.push(
        `${canonicalSpec} rates: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

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
              pricingMode: 'normal',
            },
            {
              provider: 'oci',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
              ...priced,
              currency: 'USD',
              instanceType: `${mapping.shape}/${mapping.ocpus}ocpu/${mapping.memoryInGBs}gb`,
              fetchedAt: new Date(now),
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

  const sample = Object.values(ratesByFamily)[0];
  return {
    provider: 'oci',
    written,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
    ratesSource: sample?.source || 'api',
  };
}

export { vcpuToOcpus };
