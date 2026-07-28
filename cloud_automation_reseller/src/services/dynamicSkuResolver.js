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

const PREFERRED_AWS_FAMILIES = [
  't3',
  't3a',
  'm6i',
  'm5',
  'm7i',
  'c6i',
  'c5',
  'r6i',
  'r5',
  'g4dn',
  'g5',
];

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
 * Burstable B and legacy A fit tighter but invert size ladders (e.g. B2as 8GB
 * cheaper than A2_v2 4GB), so prefer D/E/F when available.
 */
const PREFERRED_AZURE_NAME_RE = /^Standard_(D|E|F)\d/i;
const BURSTABLE_OR_LEGACY_AZURE_RE = /^Standard_(B|A)\d/i;

function azureFamilyRank(name) {
  const n = String(name || '');
  if (PREFERRED_AZURE_NAME_RE.test(n)) return 0;
  if (BURSTABLE_OR_LEGACY_AZURE_RE.test(n)) return 2;
  return 1;
}

let azureSkuCache = null;
let azureSkuCacheAt = 0;
const AZURE_SKU_TTL_MS = 6 * 60 * 60 * 1000;

let awsTypeCache = null;
let awsTypeCacheAt = 0;
const AWS_TYPE_TTL_MS = 6 * 60 * 60 * 1000;

function awsFamily(instanceType) {
  return String(instanceType).split('.')[0];
}

function familyRank(instanceType, nested = false) {
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

/**
 * Pick smallest current-gen instance that meets vCPU + RAM, preferring common families.
 * When nestedVirtualization=true, only nested-virt-capable Intel families are considered.
 */
export async function resolveAwsSku({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);
  const nested = Boolean(nestedVirtualization);

  const client = ec2ClientForRegion(awsConfig.defaultRegion || 'us-east-1');
  const types = await listAwsInstanceTypes(client);

  const candidates = types.filter((t) => {
    if (!t.currentGeneration) return false;
    if (nested && !isNestedAwsFamily(t.instanceType)) return false;
    if (gpu) {
      if (!t.gpuCount || t.gpuCount < 1) return false;
    } else if (t.gpuCount > 0) {
      return false;
    }
    return t.vcpu >= needVcpu && t.memoryGiB >= needRam;
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const overA = a.vcpu - needVcpu + (a.memoryGiB - needRam);
    const overB = b.vcpu - needVcpu + (b.memoryGiB - needRam);
    if (overA !== overB) return overA - overB;
    return familyRank(a.instanceType, nested) - familyRank(b.instanceType, nested);
  });

  const best = candidates[0];
  return {
    instanceType: best.instanceType,
    ebsGb: disk,
    vcpu: best.vcpu,
    ramGb: best.memoryGiB,
    source: nested ? 'dynamic_nested' : 'dynamic',
  };
}

async function listAwsInstanceTypes(client) {
  if (awsTypeCache && Date.now() - awsTypeCacheAt < AWS_TYPE_TTL_MS) {
    return awsTypeCache;
  }

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
      const gpuCount = (t.GpuInfo?.Gpus || []).reduce((s, g) => s + (g.Count || 0), 0);
      out.push({
        instanceType: t.InstanceType,
        vcpu,
        memoryGiB: Math.round((memoryMiB / 1024) * 10) / 10,
        gpuCount,
        currentGeneration: t.CurrentGeneration !== false,
      });
    }
    nextToken = res.NextToken;
  } while (nextToken);

  awsTypeCache = out;
  awsTypeCacheAt = Date.now();
  return out;
}

/**
 * Azure: use Resource SKUs API only.
 * Nested mode excludes B-series and only allows nested-capable series.
 * Normal mode prefers D/E/F general-purpose over burstable B / legacy A so
 * cross-cloud cheapest picks stay monotonic with size.
 * No hardcoded size ladder — returns null when the live SKU list cannot resolve a match.
 */
export async function resolveAzureSku({
  vcpu,
  ramGb,
  diskGb,
  gpu = false,
  nestedVirtualization = false,
} = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);
  const nested = Boolean(nestedVirtualization);

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
  candidates.sort((a, b) => {
    const overA = a.vcpu - needVcpu + (a.memoryGb - needRam);
    const overB = b.vcpu - needVcpu + (b.memoryGb - needRam);
    if (overA !== overB) return overA - overB;
    const rankDiff = azureFamilyRank(a.name) - azureFamilyRank(b.name);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
  const best = candidates[0];
  return {
    vmSize: best.name,
    diskGb: disk,
    source: nested ? 'dynamic_nested' : 'dynamic',
  };
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

    out.push({ name: sku.name, vcpu, memoryGb, gpu });
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
 * Uses static map when present (normal mode only); otherwise discovers dynamically.
 * Nested mode always resolves dynamically and does not pollute shared static maps.
 */
export async function ensureSkuMappings(parts) {
  const { canonicalSpec, vcpu, ramGb, diskGb, gpu, nestedVirtualization = false } = parts;
  const nested = Boolean(nestedVirtualization);
  const result = { aws: null, azure: null, oci: null, gcp: null, errors: [] };

  if (!nested && awsSpecMap[canonicalSpec]?.instanceType) {
    result.aws = awsSpecMap[canonicalSpec];
  } else {
    try {
      const aws = await resolveAwsSku({ vcpu, ramGb, diskGb, gpu, nestedVirtualization: nested });
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
  }

  if (!nested && azureSpecMap[canonicalSpec]?.vmSize) {
    result.azure = azureSpecMap[canonicalSpec];
  } else {
    try {
      const azure = await resolveAzureSku({
        vcpu,
        ramGb,
        diskGb,
        gpu,
        nestedVirtualization: nested,
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
