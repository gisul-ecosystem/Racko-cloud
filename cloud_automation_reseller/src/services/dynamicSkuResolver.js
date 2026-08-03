import { DescribeInstanceTypesCommand } from '@aws-sdk/client-ec2';
import { ComputeManagementClient } from '@azure/arm-compute';
import { ec2ClientForRegion, awsConfig } from '../config/aws.js';
import { getAzureCredential, azureConfig } from '../config/azure.js';
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
const AZURE_SKU_PRICE_REGION = 'eastus';

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

/** Azure series known to support nested virtualization (exclude B-series). */
const NESTED_AZURE_NAME_RE =
  /^Standard_(D\d+s?_v3|D\d+as_v4|D\d+ads_v5|E\d+s?_v3|E\d+as_v4|E\d+ads_v5|F\d+s_v2|F\d+)$/i;

/**
 * General-purpose Azure series for normal (non-nested) dynamic picks.
 * Includes x86 D/E/F and ARM Ampere/Cobalt (Dps/Dpls/Eps…).
 */
const PREFERRED_AZURE_NAME_RE = /^Standard_(D|E|F)\d/i;
const BURSTABLE_OR_LEGACY_AZURE_RE = /^Standard_(B|A)\d/i;

function azureFamilyRank(name) {
  const n = String(name || '');
  if (PREFERRED_AZURE_NAME_RE.test(n)) return 0;
  if (BURSTABLE_OR_LEGACY_AZURE_RE.test(n)) return 2;
  return 1;
}

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

let azureSkuCache = null;
let azureSkuCacheAt = 0;
const AZURE_SKU_TTL_MS = 6 * 60 * 60 * 1000;

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

function isNestedAzureSize(name) {
  return NESTED_AZURE_NAME_RE.test(String(name || ''));
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
    return {
      vmSize: needVcpu >= 8 ? 'Standard_NC8as_T4_v3' : 'Standard_NC4as_T4_v3',
      diskGb: disk,
      source: 'dynamic',
    };
  }

  const skus = await listAzureVmSkus();
  let candidates = skus.filter((s) => {
    if (s.vcpu < needVcpu || s.memoryGb < needRam || s.gpu) return false;
    if (!matchesArchitecture(s.architecture, archPref)) return false;
    if (nested) return isNestedAzureSize(s.name);
    return true;
  });
  if (!nested) {
    const preferred = candidates.filter((s) => azureFamilyRank(s.name) === 0);
    if (preferred.length > 0) {
      candidates = preferred;
    } else {
      const nonBurst = candidates.filter((s) => azureFamilyRank(s.name) < 2);
      if (nonBurst.length > 0) candidates = nonBurst;
    }
  }
  if (candidates.length === 0) {
    return null;
  }

  const overage = (s) => s.vcpu - needVcpu + (s.memoryGb - needRam);
  const minOver = Math.min(...candidates.map(overage));
  const shortlist = candidates
    .filter((s) => overage(s) === minOver)
    .sort((a, b) => a.name.localeCompare(b.name));

  const priceFn = windows ? fetchVmWindowsHourlyUsd : fetchVmHourlyUsd;
  const priced = await Promise.all(
    shortlist.map(async (candidate) => {
      try {
        const price = await priceFn(candidate.name, AZURE_SKU_PRICE_REGION);
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

function azureArchitectureFromSku(sku, caps) {
  const archCap = String(
    caps.CpuArchitectureType || caps.CPUArchitectureType || caps.ArchitectureType || ''
  ).toLowerCase();
  if (/arm/.test(archCap)) return 'arm64';
  if (/x64|x86/.test(archCap)) return 'x86_64';
  // Ampere/Cobalt series naming: D2ps_v5, D2pls_v6, E2pds_v5, …
  if (/^Standard_[DEF]\d+[a-z]*p[a-z]*s?_v\d+/i.test(String(sku.name || ''))) {
    return 'arm64';
  }
  return 'x86_64';
}

async function listAzureVmSkus() {
  if (azureSkuCache && Date.now() - azureSkuCacheAt < AZURE_SKU_TTL_MS) {
    return azureSkuCache;
  }
  if (!azureConfig.subscriptionId) {
    throw new Error('AZURE_SUBSCRIPTION_ID not set');
  }

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);
  const out = [];
  for await (const sku of client.resourceSkus.list()) {
    if (sku.resourceType !== 'virtualMachines') continue;
    if (sku.restrictions?.some((r) => r.reasonCode === 'NotAvailableForSubscription')) continue;

    const caps = Object.fromEntries(
      (sku.capabilities || []).map((c) => [c.name, c.value])
    );
    const vcpu = Number(caps.vCPUs || caps.NumberOfCores || 0);
    const memoryGb = Number(caps.MemoryGB || 0);
    const gpu = Number(caps.GPUs || 0) > 0;
    if (!vcpu || !memoryGb) continue;
    if (!String(sku.name || '').startsWith('Standard_')) continue;

    out.push({
      name: sku.name,
      vcpu,
      memoryGb,
      gpu,
      architecture: azureArchitectureFromSku(sku, caps),
    });
  }

  azureSkuCache = out;
  azureSkuCacheAt = Date.now();
  return out;
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
