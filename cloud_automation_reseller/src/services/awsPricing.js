import { GetProductsCommand } from '@aws-sdk/client-pricing';
import { pricingClient } from '../config/aws.js';
import { awsSpecMap, AWS_PRICING_REGIONS, awsLocationName } from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';

function extractOnDemandUsd(priceList) {
  if (!priceList?.length) return null;
  try {
    const product = JSON.parse(priceList[0]);
    const onDemand = product.terms?.OnDemand;
    if (!onDemand) return null;
    const term = onDemand[Object.keys(onDemand)[0]];
    const dims = term?.priceDimensions;
    if (!dims) return null;
    const dim = dims[Object.keys(dims)[0]];
    const unitPrice = parseFloat(dim?.pricePerUnit?.USD ?? 'NaN');
    return Number.isFinite(unitPrice) ? unitPrice : null;
  } catch {
    return null;
  }
}

async function fetchEc2Hourly(instanceType, regionCode, os = 'Linux') {
  const location = awsLocationName(regionCode);
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      { Type: 'TERM_MATCH', Field: 'location', Value: location },
      { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: os },
      { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
      { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
      { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' },
    ],
    MaxResults: 1,
  });

  const res = await pricingClient.send(command);
  return extractOnDemandUsd(res.PriceList);
}

/** Rough EBS gp3: ~$0.08/GB-month → hourly. */
function ebsHourly(ebsGb) {
  return (Number(ebsGb) || 0) * (0.08 / 730);
}

/** Elastic IP when associated ~ $0.005/hr (post-2024 free tier change). */
const IP_HOURLY = 0.005;

function categoryForSpec(canonicalSpec) {
  return canonicalSpec.includes('-gpu') ? 'gpu' : 'linux';
}

/**
 * Sync AWS EC2 on-demand prices into CloudRegionPricing for known specs.
 */
export async function syncAwsPricing() {
  const now = new Date();
  let written = 0;
  const errors = [];

  for (const [canonicalSpec, mapping] of Object.entries(awsSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories =
      category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    for (const region of AWS_PRICING_REGIONS) {
      for (const cat of categories) {
        try {
          const os = cat === 'windows' ? 'Windows' : 'Linux';
          const compute = await fetchEc2Hourly(mapping.instanceType, region, os);
          if (compute == null) {
            errors.push(`${canonicalSpec}@${region}/${cat}: no price`);
            continue;
          }
          const storage = ebsHourly(mapping.ebsGb);
          const ip = IP_HOURLY;
          const total = compute + storage + ip;

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
            },
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ip,
              rawTotalPricePerHr: total,
              currency: 'USD',
              instanceType: mapping.instanceType,
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

  return { provider: 'aws', written, errors: errors.slice(0, 20), errorCount: errors.length };
}
