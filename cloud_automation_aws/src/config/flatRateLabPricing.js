/**
 * Lab-oriented USD daily estimates for usage-based AWS services.
 * These are allowance-style holds for education/lab billing (wallet), not live unit charges.
 */

export const FLAT_RATE_UNIT_LABELS = {
  Lambda: 'per-GB-second',
  S3: 'per-GB',
  CloudFront: 'per-GB-transferred',
  SQS: 'per-million-requests',
  SNS: 'per-million-notifications',
  Kinesis: 'per-shard-hour',
  DynamoDB: 'per-RCU-WCU',
  VPC: 'per-NAT-gateway-hour',
};

/**
 * Selectable usage tiers for flat-rate services.
 * pricePerDay is the lab estimate charged per account per day.
 */
export const FLAT_RATE_LAB_TIERS = {
  S3: [
    {
      instanceType: 's3-light',
      label: 'Light',
      description: 'Est. ~5 GB storage + light GET/PUT traffic for short labs.',
      pricePerDay: 0.05,
      usageHint: '~5 GB / day',
    },
    {
      instanceType: 's3-standard',
      label: 'Standard',
      description: 'Est. ~20 GB storage with typical student lab object traffic.',
      pricePerDay: 0.15,
      usageHint: '~20 GB / day',
    },
    {
      instanceType: 's3-heavy',
      label: 'Heavy',
      description: 'Est. ~50 GB storage for media / larger lab datasets.',
      pricePerDay: 0.4,
      usageHint: '~50 GB / day',
    },
  ],
  Lambda: [
    {
      instanceType: 'lambda-light',
      label: 'Light',
      description: 'Low invoke volume — mostly free-tier shaped labs.',
      pricePerDay: 0.1,
      usageHint: '~10k invokes / day',
    },
    {
      instanceType: 'lambda-standard',
      label: 'Standard',
      description: 'Moderate GB-second usage for API / event workshop labs.',
      pricePerDay: 0.25,
      usageHint: '~100k invokes / day',
    },
    {
      instanceType: 'lambda-heavy',
      label: 'Heavy',
      description: 'Higher concurrency and payload size for advanced labs.',
      pricePerDay: 0.6,
      usageHint: '~1M invokes / day',
    },
  ],
  DynamoDB: [
    {
      instanceType: 'dynamodb-light',
      label: 'Light',
      description: 'Small on-demand table with light read/write traffic.',
      pricePerDay: 0.2,
      usageHint: 'On-demand · light',
    },
    {
      instanceType: 'dynamodb-standard',
      label: 'Standard',
      description: 'Typical student CRUD / session labs.',
      pricePerDay: 0.5,
      usageHint: 'On-demand · medium',
    },
    {
      instanceType: 'dynamodb-heavy',
      label: 'Heavy',
      description: 'Higher read/write throughput for perf-oriented labs.',
      pricePerDay: 1.2,
      usageHint: 'On-demand · heavy',
    },
  ],
  CloudFront: [
    {
      instanceType: 'cloudfront-light',
      label: 'Light',
      description: 'Low CDN transfer for static site demos.',
      pricePerDay: 0.1,
      usageHint: '~10 GB transfer / day',
    },
    {
      instanceType: 'cloudfront-standard',
      label: 'Standard',
      description: 'Moderate transfer for multi-user CDN labs.',
      pricePerDay: 0.25,
      usageHint: '~50 GB transfer / day',
    },
    {
      instanceType: 'cloudfront-heavy',
      label: 'Heavy',
      description: 'Higher egress for media / streaming style labs.',
      pricePerDay: 0.75,
      usageHint: '~200 GB transfer / day',
    },
  ],
  SQS: [
    {
      instanceType: 'sqs-light',
      label: 'Light',
      description: 'Low request volume queue labs.',
      pricePerDay: 0.02,
      usageHint: '~100k requests / day',
    },
    {
      instanceType: 'sqs-standard',
      label: 'Standard',
      description: 'Typical messaging / worker workshop traffic.',
      pricePerDay: 0.05,
      usageHint: '~1M requests / day',
    },
    {
      instanceType: 'sqs-heavy',
      label: 'Heavy',
      description: 'High throughput queue labs.',
      pricePerDay: 0.15,
      usageHint: '~10M requests / day',
    },
  ],
  SNS: [
    {
      instanceType: 'sns-light',
      label: 'Light',
      description: 'Light pub/sub with email or HTTP subscribers.',
      pricePerDay: 0.02,
      usageHint: '~100k notifications / day',
    },
    {
      instanceType: 'sns-standard',
      label: 'Standard',
      description: 'Moderate fan-out for multi-user labs.',
      pricePerDay: 0.05,
      usageHint: '~1M notifications / day',
    },
    {
      instanceType: 'sns-heavy',
      label: 'Heavy',
      description: 'High fan-out notification traffic.',
      pricePerDay: 0.15,
      usageHint: '~5M notifications / day',
    },
  ],
  Kinesis: [
    {
      instanceType: 'kinesis-light',
      label: 'Light',
      description: 'Single-shard streaming intro labs.',
      pricePerDay: 0.36,
      usageHint: '~1 shard · 24h',
    },
    {
      instanceType: 'kinesis-standard',
      label: 'Standard',
      description: 'Typical streaming workshop with light put/get.',
      pricePerDay: 0.5,
      usageHint: '~1–2 shards',
    },
    {
      instanceType: 'kinesis-heavy',
      label: 'Heavy',
      description: 'Multi-shard / higher ingest labs.',
      pricePerDay: 1.2,
      usageHint: '~3+ shards',
    },
  ],
  VPC: [
    {
      instanceType: 'vpc-basic',
      label: 'Basic',
      description: 'VPC only — no NAT Gateway hold.',
      pricePerDay: 0.05,
      usageHint: 'VPC resources only',
    },
    {
      instanceType: 'vpc-nat',
      label: 'With NAT',
      description: 'Includes estimated NAT Gateway hours for private subnet labs.',
      pricePerDay: 1.5,
      usageHint: '~1 NAT Gateway / day',
    },
    {
      instanceType: 'vpc-full',
      label: 'Full network',
      description: 'NAT + higher data processing allowance.',
      pricePerDay: 2.5,
      usageHint: 'NAT + data processing',
    },
  ],
};

export function getFlatRateLabTiers(serviceName) {
  return FLAT_RATE_LAB_TIERS[String(serviceName || '').trim()] || [];
}

export function getFlatRateLabTier(serviceName, instanceType) {
  const tiers = getFlatRateLabTiers(serviceName);
  if (tiers.length === 0) return null;

  if (instanceType) {
    const match = tiers.find((tier) => tier.instanceType === instanceType);
    if (match) return match;
  }

  return tiers.find((tier) => /standard|nat/i.test(tier.instanceType)) || tiers[Math.min(1, tiers.length - 1)] || tiers[0];
}

export function formatFlatRateLabOption(serviceName, tier, extras = {}) {
  const pricePerDay = Number(tier.pricePerDay) || 0;
  const pricePerHour = parseFloat((pricePerDay / 24).toFixed(6));

  return {
    instanceType: tier.instanceType,
    label: tier.label,
    description: tier.description,
    usageHint: tier.usageHint,
    pricePerHour,
    pricePerDay,
    priceUnit: 'Lab day',
    unitPrice: pricePerDay,
    flatRate: true,
    estimated: true,
    serviceName,
    ...extras,
  };
}
