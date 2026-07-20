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

let azureSkuCache = null;
let azureSkuCacheAt = 0;
const AZURE_SKU_TTL_MS = 6 * 60 * 60 * 1000;

let awsTypeCache = null;
let awsTypeCacheAt = 0;
const AWS_TYPE_TTL_MS = 6 * 60 * 60 * 1000;

function familyRank(instanceType) {
  const family = String(instanceType).split('.')[0];
  const idx = PREFERRED_AWS_FAMILIES.indexOf(family);
  return idx === -1 ? 100 : idx;
}

/**
 * Pick smallest current-gen instance that meets vCPU + RAM, preferring common families.
 */
export async function resolveAwsSku({ vcpu, ramGb, diskGb, gpu = false } = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);

  const client = ec2ClientForRegion(awsConfig.defaultRegion || 'us-east-1');
  const types = await listAwsInstanceTypes(client);

  const candidates = types.filter((t) => {
    if (!t.currentGeneration) return false;
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
    return familyRank(a.instanceType) - familyRank(b.instanceType);
  });

  const best = candidates[0];
  return {
    instanceType: best.instanceType,
    ebsGb: disk,
    vcpu: best.vcpu,
    ramGb: best.memoryGiB,
    source: 'dynamic',
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
 * Azure: use Resource SKUs when credentials work; else D/E-series ladder heuristic.
 */
export async function resolveAzureSku({ vcpu, ramGb, diskGb, gpu = false } = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(8, Number(diskGb) || 50);

  if (gpu) {
    return {
      vmSize: needVcpu >= 8 ? 'Standard_NC8as_T4_v3' : 'Standard_NC4as_T4_v3',
      diskGb: disk,
      source: 'dynamic',
    };
  }

  try {
    const skus = await listAzureVmSkus();
    const candidates = skus.filter(
      (s) => s.vcpu >= needVcpu && s.memoryGb >= needRam && !s.gpu
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const overA = a.vcpu - needVcpu + (a.memoryGb - needRam);
        const overB = b.vcpu - needVcpu + (b.memoryGb - needRam);
        if (overA !== overB) return overA - overB;
        return a.name.localeCompare(b.name);
      });
      const best = candidates[0];
      return { vmSize: best.name, diskGb: disk, source: 'dynamic' };
    }
  } catch (err) {
    console.warn(
      '[dynamicSku] Azure Resource SKUs failed, using size ladder:',
      err instanceof Error ? err.message : err
    );
  }

  return { vmSize: azureSizeLadder(needVcpu, needRam), diskGb: disk, source: 'ladder' };
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
    // Prefer standard SSD-capable sizes
    if (!String(sku.name || '').startsWith('Standard_')) continue;

    out.push({ name: sku.name, vcpu, memoryGb, gpu });
  }

  azureSkuCache = out;
  azureSkuCacheAt = Date.now();
  return out;
}

/** Fallback when Azure SKU list unavailable. */
function azureSizeLadder(vcpu, ramGb) {
  const ratio = ramGb / Math.max(vcpu, 1);
  // Memory-optimized E-series when RAM/vCPU is high
  if (ratio >= 7) {
    const e = [
      { v: 2, r: 16, name: 'Standard_E2s_v3' },
      { v: 4, r: 32, name: 'Standard_E4s_v3' },
      { v: 8, r: 64, name: 'Standard_E8s_v3' },
      { v: 16, r: 128, name: 'Standard_E16s_v3' },
      { v: 32, r: 256, name: 'Standard_E32s_v3' },
      { v: 64, r: 432, name: 'Standard_E64s_v3' },
    ];
    const hit = e.find((x) => x.v >= vcpu && x.r >= ramGb);
    return hit?.name || 'Standard_E16s_v3';
  }

  const d = [
    { v: 1, r: 1, name: 'Standard_B1s' },
    { v: 1, r: 2, name: 'Standard_B1ms' },
    { v: 2, r: 4, name: 'Standard_B2s' },
    { v: 2, r: 8, name: 'Standard_D2s_v3' },
    { v: 4, r: 16, name: 'Standard_D4s_v3' },
    { v: 8, r: 32, name: 'Standard_D8s_v3' },
    { v: 16, r: 64, name: 'Standard_D16s_v3' },
    { v: 32, r: 128, name: 'Standard_D32s_v3' },
    { v: 64, r: 256, name: 'Standard_D64s_v3' },
  ];
  const hit = d.find((x) => x.v >= vcpu && x.r >= ramGb);
  return hit?.name || 'Standard_D16s_v3';
}

/**
 * OCI Flex shape for arbitrary vCPU/RAM (1 OCPU ≈ 2 vCPUs on x86).
 */
export function resolveOciSku({ vcpu, ramGb, diskGb, gpu = false } = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(50, Number(diskGb) || 50);
  const ocpus = vcpuToOcpus(needVcpu);

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
    shape: 'VM.Standard.E4.Flex',
    ocpus,
    // Flex minimum memory is typically 1 GB per OCPU; honor requested RAM.
    memoryInGBs: Math.max(needRam, ocpus),
    bootVolumeGb: disk,
    source: 'dynamic',
  };
}

/**
 * GCP size ladder (E2 standard / shared-core).
 */
export function resolveGcpSku({ vcpu, ramGb, diskGb, gpu = false } = {}) {
  const needVcpu = Math.max(1, Number(vcpu) || 1);
  const needRam = Math.max(1, Number(ramGb) || 1);
  const disk = Math.max(10, Number(diskGb) || 50);

  if (gpu) {
    return {
      machineType: needVcpu >= 8 ? 'n1-standard-8' : 'n1-standard-4',
      diskGb: disk,
      acceleratorType: 'nvidia-tesla-t4',
      acceleratorCount: 1,
      source: 'dynamic',
    };
  }

  const ladder = [
    { v: 1, r: 1, name: 'e2-micro' },
    { v: 1, r: 2, name: 'e2-small' },
    { v: 2, r: 4, name: 'e2-medium' },
    { v: 2, r: 8, name: 'e2-standard-2' },
    { v: 4, r: 16, name: 'e2-standard-4' },
    { v: 8, r: 32, name: 'e2-standard-8' },
    { v: 16, r: 64, name: 'e2-standard-16' },
    { v: 32, r: 128, name: 'e2-standard-32' },
  ];
  const hit = ladder.find((x) => x.v >= needVcpu && x.r >= needRam);
  return {
    machineType: hit?.name || 'e2-standard-16',
    diskGb: disk,
    source: 'ladder',
  };
}

/**
 * Resolve + register AWS/Azure/OCI/GCP mappings for a canonical spec.
 * Uses static map when present; otherwise discovers dynamically.
 */
export async function ensureSkuMappings(parts) {
  const { canonicalSpec, vcpu, ramGb, diskGb, gpu } = parts;
  const result = { aws: null, azure: null, oci: null, gcp: null, errors: [] };

  if (awsSpecMap[canonicalSpec]?.instanceType) {
    result.aws = awsSpecMap[canonicalSpec];
  } else {
    try {
      const aws = await resolveAwsSku({ vcpu, ramGb, diskGb, gpu });
      if (aws) {
        registerAwsSpec(canonicalSpec, aws);
        result.aws = awsSpecMap[canonicalSpec];
      } else {
        result.errors.push('aws: no matching instance type');
      }
    } catch (err) {
      result.errors.push(`aws: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (azureSpecMap[canonicalSpec]?.vmSize) {
    result.azure = azureSpecMap[canonicalSpec];
  } else {
    try {
      const azure = await resolveAzureSku({ vcpu, ramGb, diskGb, gpu });
      if (azure) {
        registerAzureSpec(canonicalSpec, azure);
        result.azure = azureSpecMap[canonicalSpec];
      } else {
        result.errors.push('azure: no matching vm size');
      }
    } catch (err) {
      result.errors.push(`azure: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (ociSpecMap[canonicalSpec]?.shape) {
    result.oci = ociSpecMap[canonicalSpec];
  } else {
    try {
      const oci = resolveOciSku({ vcpu, ramGb, diskGb, gpu });
      registerOciSpec(canonicalSpec, oci);
      result.oci = ociSpecMap[canonicalSpec];
    } catch (err) {
      result.errors.push(`oci: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (gcpSpecMap[canonicalSpec]?.machineType) {
    result.gcp = gcpSpecMap[canonicalSpec];
  } else {
    try {
      const gcp = resolveGcpSku({ vcpu, ramGb, diskGb, gpu });
      registerGcpSpec(canonicalSpec, gcp);
      result.gcp = gcpSpecMap[canonicalSpec];
    } catch (err) {
      result.errors.push(`gcp: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
