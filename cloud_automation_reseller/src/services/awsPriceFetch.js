import { GetProductsCommand } from '@aws-sdk/client-pricing';
import { pricingClient } from '../config/aws.js';

export function extractOnDemandUsd(priceList) {
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

/**
 * Fetch EC2 on-demand USD/hr via AWS Price List API.
 * Uses regionCode (e.g. eu-west-1) — more reliable than human location names.
 */
export async function fetchEc2Hourly(instanceType, regionCode, os = 'Linux') {
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
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
export function ebsHourly(ebsGb) {
  return (Number(ebsGb) || 0) * (0.08 / 730);
}

export const AWS_IP_HOURLY = 0.005;
