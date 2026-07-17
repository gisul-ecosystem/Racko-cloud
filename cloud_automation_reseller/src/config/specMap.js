/**
 * Canonical catalog specs → provider instance sizes.
 * Static defaults for common sizes; unknown specs are resolved dynamically
 * via AWS DescribeInstanceTypes / Azure size matching, then registered here.
 * Override via AWS_SPEC_MAP / AZURE_SPEC_MAP env JSON.
 */

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

/** Regions to price for Phase 1. */
export const AWS_PRICING_REGIONS = (
  process.env.AWS_PRICING_REGIONS || 'ap-south-1,ap-southeast-1,us-east-1,eu-west-1'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

export const AZURE_PRICING_REGIONS = (
  process.env.AZURE_PRICING_REGIONS || 'centralindia,southindia,eastus,westeurope'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const REGION_LOCATION_NAMES = {
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'us-east-1': 'US East (N. Virginia)',
  'eu-west-1': 'Europe (Ireland)',
  'eu-central-1': 'Europe (Frankfurt)',
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
