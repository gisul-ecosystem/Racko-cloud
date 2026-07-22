import { awsSpecMap, AWS_PRICING_REGIONS } from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';
import { fetchEc2Hourly, ebsHourly, AWS_IP_HOURLY } from './awsPriceFetch.js';

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
          const ip = AWS_IP_HOURLY;
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
