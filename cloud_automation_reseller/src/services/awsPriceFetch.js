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

const ancillaryCache = new Map();
const ANCILLARY_TTL_MS = 6 * 60 * 60 * 1000;

async function cachedAncillary(key, fn) {
  const hit = ancillaryCache.get(key);
  if (hit && Date.now() - hit.at < ANCILLARY_TTL_MS) return hit.value;
  const value = await fn();
  ancillaryCache.set(key, { at: Date.now(), value });
  return value;
}

function awsVolumeApiName(diskType = 'standard_ssd') {
  return diskType === 'standard_hdd' ? 'st1' : 'gp3';
}

/**
 * Live EBS USD per GB-month for a region and disk type (Price List API).
 */
export async function fetchEbsGbMonth(regionCode, diskType = 'standard_ssd') {
  const volumeApiName = awsVolumeApiName(diskType);
  return cachedAncillary(`ebs-${volumeApiName}:${regionCode}`, async () => {
    const command = new GetProductsCommand({
      ServiceCode: 'AmazonEC2',
      Filters: [
        { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
        { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'Storage' },
        { Type: 'TERM_MATCH', Field: 'volumeApiName', Value: volumeApiName },
      ],
      MaxResults: 10,
    });
    const res = await pricingClient.send(command);
    const rate = extractOnDemandUsd(res.PriceList);
    if (rate == null) {
      throw new Error(`AWS Price List missing EBS ${volumeApiName} rate for ${regionCode}`);
    }
    return rate;
  });
}

export async function fetchEbsGp3GbMonth(regionCode) {
  return fetchEbsGbMonth(regionCode, 'standard_ssd');
}

/**
 * Live public IPv4 / Elastic IP in-use USD/hr for a region.
 */
export async function fetchAwsPublicIpHourly(regionCode) {
  return cachedAncillary(`eip:${regionCode}`, async () => {
    const command = new GetProductsCommand({
      ServiceCode: 'AmazonEC2',
      Filters: [
        { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
        { Type: 'TERM_MATCH', Field: 'group', Value: 'IP Address' },
      ],
      MaxResults: 25,
    });
    const res = await pricingClient.send(command);
    for (const raw of res.PriceList || []) {
      try {
        const product = JSON.parse(raw);
        const attrs = product.product?.attributes || {};
        const desc = `${attrs.usagetype || ''} ${attrs.groupDescription || ''} ${attrs.operation || ''}`;
        // Prefer in-use / associated public IPv4 (not idle EIP)
        if (!/PublicIPv4|ElasticIP|IdleAddress|Public IP/i.test(desc + JSON.stringify(attrs))) {
          continue;
        }
        if (/Idle/i.test(attrs.groupDescription || attrs.usagetype || '')) continue;
        const onDemand = product.terms?.OnDemand;
        if (!onDemand) continue;
        const term = onDemand[Object.keys(onDemand)[0]];
        const dims = term?.priceDimensions;
        if (!dims) continue;
        const dim = dims[Object.keys(dims)[0]];
        if (!/Hrs|Hours|Hour/i.test(dim?.unit || '')) continue;
        const unitPrice = parseFloat(dim?.pricePerUnit?.USD ?? 'NaN');
        if (Number.isFinite(unitPrice) && unitPrice >= 0) return unitPrice;
      } catch {
        /* try next */
      }
    }
    throw new Error(`AWS Price List missing public IPv4 hourly rate for ${regionCode}`);
  });
}

/** @deprecated Prefer fetchEbsGp3GbMonth — kept only if callers still sync synchronously. */
export function ebsHourly(ebsGb, gbMonthRate) {
  if (gbMonthRate == null || !Number.isFinite(gbMonthRate)) {
    throw new Error('EBS hourly requires live gp3 GB-month rate from Price List API');
  }
  return (Number(ebsGb) || 0) * (gbMonthRate / 730);
}
