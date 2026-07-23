import { awsSpecMap, AWS_PRICING_REGIONS } from '../config/specMap.js';
import CloudRegionPricing from '../models/CloudRegionPricing.js';
import {
  fetchEc2Hourly,
  ebsHourly,
  fetchEbsGp3GbMonth,
  fetchAwsPublicIpHourly,
} from './awsPriceFetch.js';

function categoryForSpec(canonicalSpec) {
  return canonicalSpec.includes('-gpu') ? 'gpu' : 'linux';
}

/**
 * Sync AWS EC2 on-demand prices into CloudRegionPricing for known specs.
 * Compute, EBS gp3, and public IP rates all come from the Price List API.
 */
export async function syncAwsPricing() {
  const now = new Date();
  let written = 0;
  const errors = [];

  for (const [canonicalSpec, mapping] of Object.entries(awsSpecMap)) {
    const category = categoryForSpec(canonicalSpec);
    const categories = category === 'gpu' ? ['gpu'] : ['linux', 'windows'];

    for (const region of AWS_PRICING_REGIONS) {
      let ebsGbMonth;
      let ipHourly;
      try {
        ebsGbMonth = await fetchEbsGp3GbMonth(region);
        ipHourly = await fetchAwsPublicIpHourly(region);
      } catch (err) {
        errors.push(
          `ancillary@${region}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      for (const cat of categories) {
        try {
          const os = cat === 'windows' ? 'Windows' : 'Linux';
          const compute = await fetchEc2Hourly(mapping.instanceType, region, os);
          if (compute == null) {
            errors.push(`${canonicalSpec}@${region}/${cat}: no price`);
            continue;
          }
          const storage = ebsHourly(mapping.ebsGb, ebsGbMonth);
          const total = compute + storage + ipHourly;

          await CloudRegionPricing.findOneAndUpdate(
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
            },
            {
              provider: 'aws',
              region,
              category: cat,
              canonicalSpec,
              pricingMode: 'normal',
              rawComputePricePerHr: compute,
              rawStoragePricePerHr: storage,
              rawIpPricePerHr: ipHourly,
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
