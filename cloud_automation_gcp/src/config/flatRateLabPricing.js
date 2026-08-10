/** Lab USD daily estimates for usage-based GCP services (wallet holds). */

export const FLAT_RATE_UNIT_LABELS = {
  'Cloud Storage': 'per-GB',
  'Cloud Functions': 'per-invocation',
  'Cloud Run': 'per-vCPU-second',
  BigQuery: 'per-TiB-scanned',
  'Pub/Sub': 'per-GB',
  Firestore: 'per-100k-reads',
  VPC: 'per-NAT-hour',
  'Cloud CDN': 'per-GB-egress',
  'Cloud DNS': 'per-zone',
  'Secret Manager': 'per-secret-version',
  'Cloud KMS': 'per-key-version',
  'Cloud Vision': 'per-1000-units',
  'Artifact Registry': 'per-GB',
  Dataflow: 'per-vCPU-hour',
  'App Engine': 'per-instance-hour',
};

export const FLAT_RATE_LAB_TIERS = {
  'Cloud Storage': [
    { instanceType: 'gcs-light', label: 'Light', description: '~5 GB/day', pricePerDay: 0.05 },
    { instanceType: 'gcs-standard', label: 'Standard', description: '~20 GB/day', pricePerDay: 0.15 },
    { instanceType: 'gcs-heavy', label: 'Heavy', description: '~50 GB/day', pricePerDay: 0.4 },
  ],
  'Cloud Functions': [
    { instanceType: 'functions-light', label: 'Light', pricePerDay: 0.1 },
    { instanceType: 'functions-standard', label: 'Standard', pricePerDay: 0.25 },
    { instanceType: 'functions-heavy', label: 'Heavy', pricePerDay: 0.6 },
  ],
  'Cloud Run': [
    { instanceType: 'run-light', label: 'Light', pricePerDay: 0.12 },
    { instanceType: 'run-standard', label: 'Standard', pricePerDay: 0.3 },
    { instanceType: 'run-heavy', label: 'Heavy', pricePerDay: 0.75 },
  ],
  Firestore: [
    { instanceType: 'firestore-light', label: 'Light', pricePerDay: 0.15 },
    { instanceType: 'firestore-standard', label: 'Standard', pricePerDay: 0.4 },
  ],
  BigQuery: [
    { instanceType: 'bq-light', label: 'Light', pricePerDay: 0.2 },
    { instanceType: 'bq-standard', label: 'Standard', pricePerDay: 0.55 },
  ],
  'Pub/Sub': [
    { instanceType: 'pubsub-light', label: 'Light', pricePerDay: 0.08 },
    { instanceType: 'pubsub-standard', label: 'Standard', pricePerDay: 0.2 },
  ],
  VPC: [
    { instanceType: 'vpc-light', label: 'Light', pricePerDay: 0.1 },
    { instanceType: 'vpc-standard', label: 'Standard', pricePerDay: 0.25 },
  ],
  'Cloud CDN': [
    { instanceType: 'cdn-light', label: 'Light', pricePerDay: 0.1 },
    { instanceType: 'cdn-standard', label: 'Standard', pricePerDay: 0.3 },
  ],
  'Cloud DNS': [{ instanceType: 'dns-standard', label: 'Standard', pricePerDay: 0.05 }],
  'Secret Manager': [{ instanceType: 'secrets-standard', label: 'Standard', pricePerDay: 0.06 }],
  'Cloud KMS': [{ instanceType: 'kms-standard', label: 'Standard', pricePerDay: 0.08 }],
  'Cloud Vision': [{ instanceType: 'vision-standard', label: 'Standard', pricePerDay: 0.15 }],
  'Artifact Registry': [{ instanceType: 'artifact-standard', label: 'Standard', pricePerDay: 0.05 }],
  Dataflow: [{ instanceType: 'dataflow-standard', label: 'Standard', pricePerDay: 0.5 }],
  'App Engine': [
    { instanceType: 'appengine-light', label: 'Light', pricePerDay: 0.12 },
    { instanceType: 'appengine-standard', label: 'Standard', pricePerDay: 0.35 },
  ],
  'Cloud Load Balancing': [{ instanceType: 'lb-standard', label: 'Standard', pricePerDay: 0.18 }],
};

export function getFlatRateLabTiers(serviceName) {
  return FLAT_RATE_LAB_TIERS[serviceName] || [];
}

export function getFlatRateLabTier(serviceName, instanceType) {
  return getFlatRateLabTiers(serviceName).find((t) => t.instanceType === instanceType) || null;
}

export function formatFlatRateLabOption(tier) {
  return {
    instanceType: tier.instanceType,
    label: tier.label,
    pricePerHour: Number((tier.pricePerDay / 24).toFixed(6)),
    pricePerDay: tier.pricePerDay,
    priceUnit: 'day',
    unitPrice: tier.pricePerDay,
    flatRate: true,
  };
}
