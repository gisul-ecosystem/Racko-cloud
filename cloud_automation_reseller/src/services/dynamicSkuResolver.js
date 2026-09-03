import { DescribeInstanceTypesCommand } from '@aws-sdk/client-ec2';
import { ec2ClientForRegion, awsConfig } from '../config/aws.js';
import { getAzureCredential, azureConfig, resolveAzurePricingRegion } from '../config/azure.js';
import {
  awsSpecMap,
  azureSpecMap,
  ociSpecMap,
  gcpSpecMap,
  registerAwsSpec,
  registerAzureSpec,
  registerOciSpec,
  registerGcpSpec,
  vcpuToOcpus,
} from '../config/specMap.js';
import { fetchEc2Hourly } from './awsPriceFetch.js';
import { fetchVmHourlyUsd, fetchVmWindowsHourlyUsd } from './azurePricing.js';

/** Prefer common families only as a price-tiebreaker (never for shortlist exclusion). */
const PREFERRED_AWS_FAMILIES = [
  't4g',
  't3',
  't3a',
  'm8g',
  'm7g',
  'm6g',
  'm7i',
  'm7i-flex',
  'm6i',
  'm5',
  'c8g',
  'c7g',
  'c6g',
  'c7i',
  'c7i-flex',
  'c6i',
  'c5a',
  'c5',
  'r8g',
  'r7g',
  'r6g',
  'r7i',
  'r6i',
  'r5',
];

/** Region used only to rank candidate SKUs by live on-demand $/hr. */
const AWS_SKU_PRICE_REGION = 'us-east-1';
/** Cap live Retail price lookups when building wizard shortlists. */
const AZURE_SKU_SHORTLIST_PRICE_FANOUT = 36;
/** Max regions to check per SKU when public-IP mode scans subscription pricing. */
const AZURE_SKU_SHORTLIST_PUBLIC_REGIONS_PER_SKU = 12;

/** Intel families that support EC2 nested virtualization (Docker/KVM guests). */
const NESTED_AWS_FAMILIES = [
  'm7i',
  'm7i-flex',
  'm8i',
  'm8i-flex',
  'c7i',
  'c7i-flex',
  'c8i',
  'c8i-flex',
  'r7i',
  'r7i-flex',
  'r8i',
  'r8i-flex',
  'm6i',
  'c6i',
  'r6i',
];

/**
 * Resolve architecture preference for pricing/SKU selection.
 * - any: true cheapest across x86 + ARM (Linux default)
 * - x86_64: Intel/AMD only (Windows/nested default; x86-only workloads)
 * - arm64: Graviton / Azure ARM only
 */
export function normalizeArchitecture(value, { category, nestedVirtualization } = {}) {
  if (nestedVirtualization) return 'x86_64';
  if (/windows/i.test(String(category || ''))) return 'x86_64';
  const raw = String(
    value ?? process.env.PRICING_ARCHITECTURE ?? 'any'
  )
    .trim()
    .toLowerCase();
  if (raw === 'arm' || raw === 'arm64' || raw === 'aarch64' || raw === 'graviton') {
    return 'arm64';
  }
  if (raw === 'x86' || raw === 'x86_64' || raw === 'amd64' || raw === 'intel') {
    return 'x86_64';
  }
  return 'any';
}

function awsFamily(instanceType) {
  return String(instanceType).split('.')[0];
}

function awsFamilyRank(instanceType, nested = false) {
  const family = awsFamily(instanceType);
  const list = nested ? NESTED_AWS_FAMILIES : PREFERRED_AWS_FAMILIES;
  const idx = list.indexOf(family);
  return idx === -1 ? 100 : idx;
}

function isNestedAwsFamily(instanceType) {
  return NESTED_AWS_FAMILIES.includes(awsFamily(instanceType));
}

function matchesArchitecture(arch, preference) {
  if (!preference || preference === 'any') return true;
  return arch === preference;
}

/**
 * Fractional GPU SKUs (e.g. g6f.large) often report Gpu.Count=0 with LogicalGpuCount>0.
 * Treat any GpuInfo / accelerator metadata as GPU-capable.
 */
function awsHasAccelerator(t) {
  const gpus = t.GpuInfo?.Gpus || [];
  if (gpus.length > 0) return true;
  if ((t.GpuInfo?.TotalGpuMemoryInMiB || 0) > 0) return true;
  if ((t.InferenceAcceleratorInfo?.Accelerators || []).length > 0) return true;
  if ((t.FpgaInfo?.Fpgas || []).length > 0) return true;
  // Family-prefix fallback for accelerator SKUs AWS may omit from GpuInfo.
  return /^(g|p|inf|trn|dl|vt|f)\d/i.test(String(t.InstanceType || ''));
}

function awsGpuUnits(t) {
  const gpus = t.GpuInfo?.Gpus || [];
  let units = 0;
  for (const g of gpus) {
    units += Number(g.Count) || Number(g.LogicalGpuCount) || Number(g.GpuPartitionSize) || 0;
  }
  if (units > 0) return units;
  return awsHasAccelerator(t) ? 1 : 0;
}

/**
 * Pick the cheapest current-gen AWS instance that meets vCPU + RAM.
 * Candidate list comes from DescribeInstanceTypes; ranking uses live Price List
 * $/hr so Graviton can win when architecture allows it.
 *
 * Important: every exact-fit candidate is priced. Family preference is only a
 * tiebreaker — never used to drop ARM SKUs from the shortlist (that caused
 * non-deterministic c5a vs t4g flips).
 */
export async function resolveAwsSku({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
  category = 'linux',
  architecture,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);
  const nested = Boolean(nestedVirtualization);
  const windows = /windows/i.test(String(category || ''));
  const os = windows ? 'Windows' : 'Linux';
  const archPref = normalizeArchitecture(architecture, {
    category,
    nestedVirtualization: nested,
  });

  const client = ec2ClientForRegion(awsConfig.defaultRegion || 'us-east-1');
  const types = await listAwsInstanceTypes(client);

  const candidates = types.filter((t) => {
    if (!t.currentGeneration) return false;
    if (nested && !isNestedAwsFamily(t.instanceType)) return false;
    if (!matchesArchitecture(t.architecture, archPref)) return false;
    if (gpu) {
      if (!t.hasAccelerator) return false;
    } else if (t.hasAccelerator) {
      return false;
    }
    return t.vcpu >= needVcpu && t.memoryGiB >= needRam;
  });

  if (candidates.length === 0) {
    return null;
  }

  const overage = (t) => t.vcpu - needVcpu + (t.memoryGiB - needRam);
  const minOver = Math.min(...candidates.map(overage));
  // Stable order, then price *all* exact/min-overage fits (no preferred-family cutoff).
  const shortlist = candidates
    .filter((t) => overage(t) === minOver)
    .sort((a, b) => a.instanceType.localeCompare(b.instanceType));

  const priced = await Promise.all(
    shortlist.map(async (candidate) => {
      try {
        const price = await fetchEc2Hourly(
          candidate.instanceType,
          AWS_SKU_PRICE_REGION,
          os
        );
        return { candidate, price: Number.isFinite(price) ? price : null };
      } catch {
        return { candidate, price: null };
      }
    })
  );

  let best = shortlist[0];
  let bestPrice = Number.POSITIVE_INFINITY;
  for (const { candidate, price } of priced) {
    if (price == null) continue;
    if (
      price < bestPrice ||
      (price === bestPrice &&
        awsFamilyRank(candidate.instanceType, nested) <
          awsFamilyRank(best.instanceType, nested)) ||
      (price === bestPrice &&
        awsFamilyRank(candidate.instanceType, nested) ===
          awsFamilyRank(best.instanceType, nested) &&
        candidate.instanceType.localeCompare(best.instanceType) < 0)
    ) {
      bestPrice = price;
      best = candidate;
    }
  }

  return {
    instanceType: best.instanceType,
    ebsGb: disk,
    vcpu: best.vcpu,
    ramGb: best.memoryGiB,
    architecture: best.architecture,
    architecturePreference: archPref,
    source: nested ? 'dynamic_nested' : 'dynamic',
  };
}

async function listAwsInstanceTypes(client) {
  const out = [];
  let nextToken;
  do {
    const res = await client.send(
      new DescribeInstanceTypesCommand({
        NextToken: nextToken,
        MaxResults: 100,
      })
    );
    for (const t of res.InstanceTypes || []) {
      const vcpu = t.VCpuInfo?.DefaultVCpus || 0;
      const memoryMiB = t.MemoryInfo?.SizeInMiB || 0;
      const arches = t.ProcessorInfo?.SupportedArchitectures || [];
      const architecture = arches.includes('arm64')
        ? 'arm64'
        : arches.includes('x86_64')
          ? 'x86_64'
          : arches[0] || 'x86_64';
      out.push({
        instanceType: t.InstanceType,
        vcpu,
        memoryGiB: Math.round((memoryMiB / 1024) * 10) / 10,
        architecture,
        hasAccelerator: awsHasAccelerator(t),
        gpuCount: awsGpuUnits(t),
        currentGeneration: t.CurrentGeneration !== false,
      });
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return out;
}

/**
 * Azure: Resource SKUs API + live Retail price ranking among exact-fit GP SKUs.
 * Includes ARM (Dps/Dpls/Eps…) when architecture allows, so AWS Graviton vs Azure
 * ARM comparisons are apples-to-apples.
 */
function compareAzureSkuFit(a, b, needVcpu, needRam) {
  const ramOverA = a.memoryGb - needRam;
  const ramOverB = b.memoryGb - needRam;
  if (ramOverA !== ramOverB) return ramOverA - ramOverB;

  const vcpuOverA = a.vcpu - needVcpu;
  const vcpuOverB = b.vcpu - needVcpu;
  if (vcpuOverA !== vcpuOverB) return vcpuOverA - vcpuOverB;

  return a.name.localeCompare(b.name);
}

function rankAzureSkuCandidates(candidates, needVcpu, needRam) {
  return [...candidates].sort((a, b) => compareAzureSkuFit(a, b, needVcpu, needRam));
}

function filterAzureSkusForSpec(skus, {
  needVcpu,
  needRam,
  nested,
  archPref,
  gpu = false,
}) {
  return skus.filter((s) => {
    if (s.vcpu < needVcpu || s.memoryGb < needRam) return false;
    if (gpu ? !s.gpu : s.gpu) return false;
    if (!matchesArchitecture(s.architecture, archPref)) return false;
    if (nested && !s.nestedVirtualizationCapable) return false;
    return true;
  });
}

/** SKUs that satisfy vCPU/RAM/GPU/nested/arch filters (best RAM/vCPU fit). */
export async function shortlistAzureSkusForSpec({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
  category = 'linux',
  architecture,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const nested = Boolean(nestedVirtualization);
  const archPref = normalizeArchitecture(architecture, {
    category,
    nestedVirtualization: nested,
  });

  const skus = await listAzureVmSkus();
  const candidates = filterAzureSkusForSpec(skus, {
    needVcpu,
    needRam,
    nested,
    archPref,
    gpu,
  });
  if (candidates.length === 0) {
    return [];
  }

  const ranked = rankAzureSkuCandidates(candidates, needVcpu, needRam);
  const best = ranked[0];
  const bestRamOver = best.memoryGb - needRam;
  const bestVcpuOver = best.vcpu - needVcpu;
  const ties = ranked.filter(
    (s) => s.memoryGb - needRam === bestRamOver && s.vcpu - needVcpu === bestVcpuOver
  );
  const seen = new Set();
  return ties.filter((s) => {
    const key = String(s.name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Ranked Azure VM sizes for a requested spec — wizard step 2.
 * Private IP: price in AZURE_LOCATION (home / VNet region).
 * Public IP: lowest compute $/hr across subscription regions where each SKU is offered.
 */
export async function listAzureVmSizeCandidatesForSpec({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
  category = 'linux',
  architecture,
  limit = 6,
  pricingRegion,
  assignPublicIp = false,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);
  const nested = Boolean(nestedVirtualization);
  const assignPublic = Boolean(assignPublicIp);
  const archPref = normalizeArchitecture(architecture, {
    category,
    nestedVirtualization: nested,
  });
  const maxRows = Math.min(Math.max(Number(limit) || 6, 1), 24);
  const homeRegion = resolveAzurePricingRegion(pricingRegion);
  const windows = /windows/i.test(String(category || ''));
  const priceFn = windows ? fetchVmWindowsHourlyUsd : fetchVmHourlyUsd;

  const { resolvePlacementRegionsForAzure } = await import(
    '../provisioners/azure/azureNetwork.js'
  );
  const { normalizeAzureRegion } = await import('../provisioners/azure/azureSkuAvailability.js');

  const subscriptionRegions = assignPublic
    ? (await resolvePlacementRegionsForAzure({ assignPublicIp: true })).regions
    : [homeRegion];

  const { skus, source } = await listAzureVmSkusForMatching();
  const candidates = filterAzureSkusForSpec(skus, {
    needVcpu,
    needRam,
    nested,
    archPref,
    gpu,
  });
  const ranked = rankAzureSkuCandidates(candidates, needVcpu, needRam);
  const seen = new Set();
  const uniqueRanked = ranked.filter((s) => {
    const key = String(s.name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const regionAvailable = (sku) =>
    assignPublic
      ? subscriptionRegions.some((region) => skuRecordAvailableInRegion(sku, region))
      : skuRecordAvailableInRegion(sku, homeRegion);

  const available = uniqueRanked.filter(regionAvailable);
  const toPrice = (available.length > 0 ? available : uniqueRanked).slice(
    0,
    AZURE_SKU_SHORTLIST_PRICE_FANOUT
  );

  const regionsForSku = (sku) => {
    if (!assignPublic) return [homeRegion];
    const sub = new Set(subscriptionRegions.map(normalizeAzureRegion));
    const locs = [
      ...new Set((sku.locations || []).map(normalizeAzureRegion).filter(Boolean)),
    ];
    const pool = locs.filter((loc) => sub.has(loc) && skuRecordAvailableInRegion(sku, loc));
    if (pool.length === 0) {
      return locs.filter((loc) => sub.has(loc)).slice(0, AZURE_SKU_SHORTLIST_PUBLIC_REGIONS_PER_SKU);
    }
    return pool.slice(0, AZURE_SKU_SHORTLIST_PUBLIC_REGIONS_PER_SKU);
  };

  const priced = await Promise.all(
    toPrice.map(async (sku) => {
      const regions = regionsForSku(sku);
      let best = { price: null, pricingRegion: regions[0] || homeRegion };
      for (const region of regions) {
        try {
          const price = await priceFn(sku.name, region);
          if (Number.isFinite(price) && (best.price == null || price < best.price)) {
            best = { price, pricingRegion: region };
          }
        } catch {
          /* try next region */
        }
      }
      return { sku, price: best.price, pricingRegion: best.pricingRegion };
    })
  );

  const pricedMatches = priced.filter((row) => row.price != null);
  pricedMatches.sort(
    (a, b) =>
      a.price - b.price ||
      compareAzureSkuFit(a.sku, b.sku, needVcpu, needRam)
  );

  const chosen = pricedMatches.length > 0 ? pricedMatches : priced;
  const top = chosen.slice(0, maxRows);
  const sizes = top.map(({ sku: s, price, pricingRegion: rowRegion }) => ({
    vmSize: s.name,
    vcpu: s.vcpu,
    memoryGb: s.memoryGb,
    architecture: s.architecture,
    exactSpec: s.vcpu === needVcpu && s.memoryGb === needRam,
    exactRam: s.memoryGb === needRam,
    exactVcpu: s.vcpu === needVcpu,
    vcpuOverage: s.vcpu - needVcpu,
    ramOverage: s.memoryGb - needRam,
    estimatedHourlyUsd: price ?? null,
    pricingRegion: rowRegion ?? null,
  }));

  return {
    sizes,
    total: uniqueRanked.length,
    pricedCount: pricedMatches.length,
    pricingScope: assignPublic ? 'subscription' : 'home',
    pricingRegion: assignPublic ? null : homeRegion,
    homeRegion,
    requested: { vcpu: needVcpu, ramGb: needRam, diskGb: disk },
    source,
  };
}

export async function resolveAzureSku({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
  category = 'linux',
  architecture,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);
  const nested = Boolean(nestedVirtualization);
  const windows = /windows/i.test(String(category || ''));
  const archPref = normalizeArchitecture(architecture, {
    category,
    nestedVirtualization: nested,
  });

  if (gpu) {
    const shortlist = await shortlistAzureSkusForSpec({
      vcpu: needVcpu,
      ramGb: needRam,
      diskGb: disk,
      gpu: true,
      nestedVirtualization: nested,
      category,
      architecture,
    });
    if (shortlist.length === 0) return null;
    return {
      vmSize: shortlist[0].name,
      diskGb: disk,
      architecture: shortlist[0].architecture,
      architecturePreference: archPref,
      source: 'dynamic',
    };
  }

  const shortlist = await shortlistAzureSkusForSpec({
    vcpu: needVcpu,
    ramGb: needRam,
    diskGb: disk,
    gpu,
    nestedVirtualization: nested,
    category,
    architecture,
  });
  if (shortlist.length === 0) {
    return null;
  }

  const priceFn = windows ? fetchVmWindowsHourlyUsd : fetchVmHourlyUsd;
  const priceRegion = resolveAzurePricingRegion();
  const priced = await Promise.all(
    shortlist.map(async (candidate) => {
      try {
        const price = await priceFn(candidate.name, priceRegion);
        return { candidate, price: Number.isFinite(price) ? price : null };
      } catch {
        return { candidate, price: null };
      }
    })
  );

  let best = shortlist[0];
  let bestPrice = Number.POSITIVE_INFINITY;
  for (const { candidate, price } of priced) {
    if (price == null) continue;
    if (
      price < bestPrice ||
      (price === bestPrice && candidate.name.localeCompare(best.name) < 0)
    ) {
      bestPrice = price;
      best = candidate;
    }
  }

  return {
    vmSize: best.name,
    diskGb: disk,
    architecture: best.architecture,
    architecturePreference: archPref,
    source: nested ? 'dynamic_nested' : 'dynamic',
  };
}

import {
  listAzureVmSkus as listAzureVmSkusFromCatalog,
  listAzureVmSkusForMatching,
} from '../provisioners/azure/azureCatalogLookup.js';
import { skuRecordAvailableInRegion } from '../provisioners/azure/azureSkuAvailability.js';

async function listAzureVmSkus() {
  return listAzureVmSkusFromCatalog();
}

/** Azure SKUs come from Resource SKUs API only — no hardcoded size ladder. */

/**
 * OCI Flex shape for arbitrary vCPU/RAM (1 OCPU ≈ 2 vCPUs on x86).
 * Nested mode prefers Intel Standard3.Flex over AMD E4.Flex.
 * Shape name is a capability selection; unit rates are fetched live for that shape family.
 */
export function resolveOciSku({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(50, Number(diskGb) || 50);
  const ocpus = vcpuToOcpus(needVcpu);
  const nested = Boolean(nestedVirtualization);

  if (gpu) {
    return {
      shape: 'VM.GPU.A10.1',
      ocpus: 15,
      memoryInGBs: Math.max(240, needRam),
      bootVolumeGb: disk,
      source: 'dynamic',
    };
  }

  return {
    shape: nested ? 'VM.Standard3.Flex' : 'VM.Standard.E4.Flex',
    ocpus,
    memoryInGBs: Math.max(needRam, ocpus),
    bootVolumeGb: disk,
    source: nested ? 'dynamic_nested' : 'dynamic',
  };
}

/**
 * GCP machine-type selection by vCPU/RAM.
 * Nested mode uses N2 (Haswell+); E2 does not support nested virt.
 * Names follow GCP's published standard machine types; prices come from Billing Catalog.
 */
export function resolveGcpSku({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(10, Number(diskGb) || 50);
  const nested = Boolean(nestedVirtualization);

  if (gpu) {
    return {
      machineType: needVcpu >= 8 ? 'n1-standard-8' : 'n1-standard-4',
      diskGb: disk,
      acceleratorType: 'nvidia-tesla-t4',
      acceleratorCount: 1,
      source: 'dynamic',
    };
  }

  const pick = (types) => {
    const hit = types.find((x) => x.v >= needVcpu && x.r >= needRam);
    if (!hit) return null;
    return hit.name;
  };

  if (nested) {
    const machineType = pick([
      { v: 2, r: 8, name: 'n2-standard-2' },
      { v: 4, r: 16, name: 'n2-standard-4' },
      { v: 8, r: 32, name: 'n2-standard-8' },
      { v: 16, r: 64, name: 'n2-standard-16' },
      { v: 32, r: 128, name: 'n2-standard-32' },
      { v: 48, r: 192, name: 'n2-standard-48' },
      { v: 64, r: 256, name: 'n2-standard-64' },
      { v: 80, r: 320, name: 'n2-standard-80' },
    ]);
    if (!machineType) return null;
    return { machineType, diskGb: disk, source: 'dynamic_nested' };
  }

  const machineType = pick([
    { v: 1, r: 1, name: 'e2-micro' },
    { v: 1, r: 2, name: 'e2-small' },
    { v: 2, r: 4, name: 'e2-medium' },
    { v: 2, r: 8, name: 'e2-standard-2' },
    { v: 4, r: 16, name: 'e2-standard-4' },
    { v: 8, r: 32, name: 'e2-standard-8' },
    { v: 16, r: 64, name: 'e2-standard-16' },
    { v: 32, r: 128, name: 'e2-standard-32' },
  ]);
  if (!machineType) return null;
  return { machineType, diskGb: disk, source: 'dynamic' };
}

/**
 * Resolve + register AWS/Azure/OCI/GCP mappings for a canonical spec.
 * AWS and Azure resolve dynamically every time (live SKU catalogs + live price
 * ranking). Architecture preference is honored for both.
 * Nested mode always resolves dynamically and does not pollute shared static maps.
 */
export async function ensureSkuMappings(parts) {
  const {
    canonicalSpec,
    vcpu,
    ramGb,
    diskGb,
    gpu,
    nestedVirtualization = false,
    category = 'linux',
    architecture,
  } = parts;
  const nested = Boolean(nestedVirtualization);
  const archPref = normalizeArchitecture(architecture, {
    category,
    nestedVirtualization: nested,
  });
  const result = {
    aws: null,
    azure: null,
    oci: null,
    gcp: null,
    errors: [],
    architecturePreference: archPref,
  };

  try {
    const aws = await resolveAwsSku({
      vcpu,
      ramGb,
      diskGb,
      gpu,
      nestedVirtualization: nested,
      category,
      architecture: archPref,
    });
    if (aws) {
      if (!nested) {
        registerAwsSpec(canonicalSpec, aws);
        result.aws = awsSpecMap[canonicalSpec];
      } else {
        result.aws = aws;
      }
    } else {
      result.errors.push(
        nested ? 'aws: no nested-virt matching instance type' : 'aws: no matching instance type'
      );
    }
  } catch (err) {
    result.errors.push(`aws: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const azure = await resolveAzureSku({
      vcpu,
      ramGb,
      diskGb,
      gpu,
      nestedVirtualization: nested,
      category,
      architecture: archPref,
    });
    if (azure) {
      if (!nested) {
        registerAzureSpec(canonicalSpec, azure);
        result.azure = azureSpecMap[canonicalSpec];
      } else {
        result.azure = azure;
      }
    } else {
      result.errors.push(
        nested ? 'azure: no nested-virt matching vm size' : 'azure: no matching vm size'
      );
    }
  } catch (err) {
    result.errors.push(`azure: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!nested && ociSpecMap[canonicalSpec]?.shape) {
    result.oci = ociSpecMap[canonicalSpec];
  } else {
    try {
      const oci = resolveOciSku({ vcpu, ramGb, diskGb, gpu, nestedVirtualization: nested });
      if (!nested) {
        registerOciSpec(canonicalSpec, oci);
        result.oci = ociSpecMap[canonicalSpec];
      } else {
        result.oci = oci;
      }
    } catch (err) {
      result.errors.push(`oci: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!nested && gcpSpecMap[canonicalSpec]?.machineType) {
    result.gcp = gcpSpecMap[canonicalSpec];
  } else {
    try {
      const gcp = resolveGcpSku({ vcpu, ramGb, diskGb, gpu, nestedVirtualization: nested });
      if (gcp) {
        if (!nested) {
          registerGcpSpec(canonicalSpec, gcp);
          result.gcp = gcpSpecMap[canonicalSpec];
        } else {
          result.gcp = gcp;
        }
      } else {
        result.errors.push(
          nested ? 'gcp: no nested-virt matching machine type' : 'gcp: no matching machine type'
        );
      }
    } catch (err) {
      result.errors.push(`gcp: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
