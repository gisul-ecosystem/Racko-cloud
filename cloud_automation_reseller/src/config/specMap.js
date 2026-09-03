/**
 * Canonical catalog specs → provider instance sizes.
 * Static defaults for common sizes; unknown specs are resolved dynamically
 * via AWS DescribeInstanceTypes / Azure size matching / OCI Flex shapes, then registered here.
 * Override via AWS_SPEC_MAP / AZURE_SPEC_MAP / OCI_SPEC_MAP / GCP_SPEC_MAP env JSON.
 */

import { azureConfig } from './azure.js';

const DEFAULT_AWS_SPEC_MAP = {
  '1vcpu-1gb-20gbssd': { instanceType: 't3.micro', ebsGb: 20 },
  '1vcpu-2gb-40gbssd': { instanceType: 't3.small', ebsGb: 40 },
  '2vcpu-4gb-50gbssd': { instanceType: 't3.medium', ebsGb: 50 },
  '2vcpu-8gb-50gbssd': { instanceType: 't3.large', ebsGb: 50 },
  '4vcpu-16gb-100gbssd': { instanceType: 't3.xlarge', ebsGb: 100 },
  '8vcpu-32gb-200gbssd': { instanceType: 't3.2xlarge', ebsGb: 200 },
  '4vcpu-16gb-100gbssd-gpu': { instanceType: 'g4dn.xlarge', ebsGb: 100 },
};

const DEFAULT_AZURE_SPEC_MAP = {
  '1vcpu-1gb-20gbssd': { vmSize: 'Standard_B1s', diskGb: 20 },
  '1vcpu-2gb-40gbssd': { vmSize: 'Standard_B1ms', diskGb: 40 },
  '2vcpu-4gb-50gbssd': { vmSize: 'Standard_B2s', diskGb: 50 },
  '2vcpu-8gb-50gbssd': { vmSize: 'Standard_D2s_v3', diskGb: 50 },
  '4vcpu-16gb-100gbssd': { vmSize: 'Standard_D4s_v3', diskGb: 100 },
  '8vcpu-32gb-200gbssd': { vmSize: 'Standard_D8s_v3', diskGb: 200 },
  '4vcpu-16gb-100gbssd-gpu': { vmSize: 'Standard_NC4as_T4_v3', diskGb: 100 },
};

/**
 * OCI Flex shapes: on x86, 1 OCPU ≈ 2 vCPUs.
 * shape + ocpus + memoryInGBs + bootVolumeGb
 */
const DEFAULT_OCI_SPEC_MAP = {
  '1vcpu-1gb-20gbssd': {
    shape: 'VM.Standard.E4.Flex',
    ocpus: 1,
    memoryInGBs: 1,
    bootVolumeGb: 20,
  },
  '1vcpu-2gb-40gbssd': {
    shape: 'VM.Standard.E4.Flex',
    ocpus: 1,
    memoryInGBs: 2,
    bootVolumeGb: 40,
  },
  '2vcpu-4gb-50gbssd': {
    shape: 'VM.Standard.E4.Flex',
    ocpus: 1,
    memoryInGBs: 4,
    bootVolumeGb: 50,
  },
  '2vcpu-8gb-50gbssd': {
    shape: 'VM.Standard.E4.Flex',
    ocpus: 1,
    memoryInGBs: 8,
    bootVolumeGb: 50,
  },
  '4vcpu-16gb-100gbssd': {
    shape: 'VM.Standard.E4.Flex',
    ocpus: 2,
    memoryInGBs: 16,
    bootVolumeGb: 100,
  },
  '8vcpu-32gb-200gbssd': {
    shape: 'VM.Standard.E4.Flex',
    ocpus: 4,
    memoryInGBs: 32,
    bootVolumeGb: 200,
  },
  '4vcpu-16gb-100gbssd-gpu': {
    shape: 'VM.GPU.A10.1',
    ocpus: 15,
    memoryInGBs: 240,
    bootVolumeGb: 100,
  },
};

/**
 * GCP Compute Engine machine types (+ optional GPU accelerators).
 */
const DEFAULT_GCP_SPEC_MAP = {
  '1vcpu-1gb-20gbssd': { machineType: 'e2-micro', diskGb: 20 },
  '1vcpu-2gb-40gbssd': { machineType: 'e2-small', diskGb: 40 },
  '2vcpu-4gb-50gbssd': { machineType: 'e2-medium', diskGb: 50 },
  '2vcpu-8gb-50gbssd': { machineType: 'e2-standard-2', diskGb: 50 },
  '4vcpu-16gb-100gbssd': { machineType: 'e2-standard-4', diskGb: 100 },
  '8vcpu-32gb-200gbssd': { machineType: 'e2-standard-8', diskGb: 200 },
  '4vcpu-16gb-100gbssd-gpu': {
    machineType: 'n1-standard-4',
    diskGb: 100,
    acceleratorType: 'nvidia-tesla-t4',
    acceleratorCount: 1,
  },
};

function parseMap(envValue, fallback) {
  if (!envValue) return { ...fallback };
  try {
    return { ...fallback, ...JSON.parse(envValue) };
  } catch {
    console.warn('[specMap] Failed to parse env JSON override, using defaults');
    return { ...fallback };
  }
}

/** Mutable — dynamic resolver registers newly discovered specs here. */
export const awsSpecMap = parseMap(process.env.AWS_SPEC_MAP, DEFAULT_AWS_SPEC_MAP);
export const azureSpecMap = parseMap(process.env.AZURE_SPEC_MAP, DEFAULT_AZURE_SPEC_MAP);
export const ociSpecMap = parseMap(process.env.OCI_SPEC_MAP, DEFAULT_OCI_SPEC_MAP);
export const gcpSpecMap = parseMap(process.env.GCP_SPEC_MAP, DEFAULT_GCP_SPEC_MAP);

export function registerAwsSpec(canonicalSpec, mapping) {
  if (!canonicalSpec || !mapping?.instanceType) return;
  awsSpecMap[canonicalSpec] = {
    instanceType: mapping.instanceType,
    ebsGb: Number(mapping.ebsGb) || 50,
    source: mapping.source || 'dynamic',
  };
}

export function registerAzureSpec(canonicalSpec, mapping) {
  if (!canonicalSpec || !mapping?.vmSize) return;
  azureSpecMap[canonicalSpec] = {
    vmSize: mapping.vmSize,
    diskGb: Number(mapping.diskGb) || 50,
    source: mapping.source || 'dynamic',
  };
}

export function registerOciSpec(canonicalSpec, mapping) {
  if (!canonicalSpec || !mapping?.shape) return;
  ociSpecMap[canonicalSpec] = {
    shape: mapping.shape,
    ocpus: Number(mapping.ocpus) || 1,
    memoryInGBs: Number(mapping.memoryInGBs) || 8,
    bootVolumeGb: Number(mapping.bootVolumeGb) || 50,
    source: mapping.source || 'dynamic',
  };
}

export function registerGcpSpec(canonicalSpec, mapping) {
  if (!canonicalSpec || !mapping?.machineType) return;
  gcpSpecMap[canonicalSpec] = {
    machineType: mapping.machineType,
    diskGb: Number(mapping.diskGb) || 50,
    ...(mapping.acceleratorType
      ? {
          acceleratorType: mapping.acceleratorType,
          acceleratorCount: Number(mapping.acceleratorCount) || 1,
        }
      : {}),
    source: mapping.source || 'dynamic',
  };
}

/** Regions to price for Phase 1. */
export const AWS_PRICING_REGIONS = (
  process.env.AWS_PRICING_REGIONS || 'ap-south-1,ap-southeast-1,us-east-1,eu-west-1'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

/** Azure pricing sync regions — optional AZURE_PRICING_REGIONS env, else home location only. */
export const AZURE_PRICING_REGIONS = (
  process.env.AZURE_PRICING_REGIONS || azureConfig.location || ''
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

/** OCI list prices are global USD; we still store per-region for parity / future regional rates. */
export const OCI_PRICING_REGIONS = (
  process.env.OCI_PRICING_REGIONS || 'ap-mumbai-1,ap-singapore-1,us-ashburn-1,eu-frankfurt-1'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

export const GCP_PRICING_REGIONS = (
  process.env.GCP_PRICING_REGIONS ||
  'asia-south1,asia-southeast1,us-central1,europe-west1'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const REGION_LOCATION_NAMES = {
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'us-east-1': 'US East (N. Virginia)',
  'eu-west-1': 'EU (Ireland)',
  'eu-central-1': 'EU (Frankfurt)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
};

export function awsLocationName(regionCode) {
  return REGION_LOCATION_NAMES[regionCode] || regionCode;
}

/**
 * Build canonicalSpec from catalog plan specs when planId is not already canonical.
 * e.g. cpu "2 vCPU", ram "8 GB", disk "50 GB" → "2vcpu-8gb-50gbssd"
 */
export function specsToCanonical(specs = {}, category = 'linux') {
  const cpu = String(specs.cpu || '').replace(/[^\d]/g, '') || '2';
  const ram = String(specs.ram || '').replace(/[^\d]/g, '') || '8';
  const disk = String(specs.disk || '').replace(/[^\d]/g, '') || '50';
  const base = `${cpu}vcpu-${ram}gb-${disk}gbssd`;
  return category === 'gpu' ? `${base}-gpu` : base;
}

/**
 * Parse "16vcpu-64gb-400gbssd" or "4vcpu-16gb-100gbssd-gpu" → numbers.
 */
export function parseCanonicalSpec(canonicalSpec = '') {
  const s = String(canonicalSpec).toLowerCase();
  const m = s.match(/^(\d+)vcpu-(\d+)gb-(\d+)gbssd(-gpu)?$/);
  if (!m) return null;
  return {
    vcpu: Number(m[1]),
    ramGb: Number(m[2]),
    diskGb: Number(m[3]),
    gpu: Boolean(m[4]),
  };
}

export function resolveSpecParts(canonicalSpec, specs = {}, category = 'linux') {
  const parsed = parseCanonicalSpec(canonicalSpec);
  if (parsed) {
    return {
      canonicalSpec:
        category === 'gpu' || parsed.gpu
          ? `${parsed.vcpu}vcpu-${parsed.ramGb}gb-${parsed.diskGb}gbssd-gpu`
          : `${parsed.vcpu}vcpu-${parsed.ramGb}gb-${parsed.diskGb}gbssd`,
      vcpu: parsed.vcpu,
      ramGb: parsed.ramGb,
      diskGb: parsed.diskGb,
      gpu: category === 'gpu' || parsed.gpu,
    };
  }

  const vcpu = Number(String(specs.cpu || '').replace(/[^\d]/g, '')) || 2;
  const ramGb = Number(String(specs.ram || '').replace(/[^\d]/g, '')) || 8;
  const diskGb = Number(String(specs.disk || '').replace(/[^\d]/g, '')) || 50;
  const gpu = category === 'gpu';
  const spec = specsToCanonical({ cpu: vcpu, ram: ramGb, disk: diskGb }, category);
  return { canonicalSpec: spec, vcpu, ramGb, diskGb, gpu };
}

/**
 * Map catalog vCPU → OCI OCPUs (x86: 1 OCPU ≈ 2 vCPUs).
 */
export function vcpuToOcpus(vcpu) {
  return Math.max(1, Math.ceil(Number(vcpu) / 2));
}
