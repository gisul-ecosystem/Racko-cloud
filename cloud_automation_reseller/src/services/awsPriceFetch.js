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

function onDemandHourlyEntries(priceList) {
  const out = [];
  for (const raw of priceList || []) {
    try {
      const product = JSON.parse(raw);
      const attrs = product.product?.attributes || {};
      const onDemand = product.terms?.OnDemand;
      if (!onDemand) continue;
      const term = onDemand[Object.keys(onDemand)[0]];
      const dims = term?.priceDimensions;
      if (!dims) continue;
      const dim = dims[Object.keys(dims)[0]];
      const unitPrice = parseFloat(dim?.pricePerUnit?.USD ?? 'NaN');
      if (!Number.isFinite(unitPrice)) continue;
      if (!/Hrs|Hours|Hour/i.test(dim?.unit || '')) continue;
      out.push({
        attrs,
        description: String(dim?.description || ''),
        unitPrice,
      });
    } catch {
      /* ignore malformed row */
    }
  }
  return out;
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
    MaxResults: 20,
  });

  const res = await pricingClient.send(command);
  const entries = onDemandHourlyEntries(res.PriceList);

  if (/windows/i.test(os)) {
    const included = entries.find(
      (e) =>
        e.attrs.operatingSystem === 'Windows' &&
        e.attrs.preInstalledSw === 'NA' &&
        e.attrs.licenseModel === 'No License required' &&
        !/BYOL|without licenses/i.test(e.description)
    );
    if (included) return included.unitPrice;
  }

  const standard = entries.find(
    (e) =>
      e.attrs.operatingSystem === os &&
      e.attrs.preInstalledSw === 'NA' &&
      !/BYOL|without licenses/i.test(e.description)
  );
  return standard?.unitPrice ?? extractOnDemandUsd(res.PriceList);
}

/**
 * Live EBS gp3 USD per GB-month for a region (Price List API).
 */
export async function fetchEbsGp3GbMonth(regionCode) {
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
      { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'Storage' },
      { Type: 'TERM_MATCH', Field: 'volumeApiName', Value: 'gp3' },
    ],
    MaxResults: 10,
  });
  const res = await pricingClient.send(command);
  const rate = extractOnDemandUsd(res.PriceList);
  if (rate == null) {
    throw new Error(`AWS Price List missing EBS gp3 rate for ${regionCode}`);
  }
  return rate;
}

/**
 * Live public IPv4 / Elastic IP in-use USD/hr for a region.
 */
export async function fetchAwsPublicIpHourly(regionCode) {
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonVPC',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
      { Type: 'TERM_MATCH', Field: 'group', Value: 'VPCPublicIPv4Address' },
    ],
    MaxResults: 25,
  });
  const res = await pricingClient.send(command);
  for (const raw of res.PriceList || []) {
    try {
      const product = JSON.parse(raw);
      const attrs = product.product?.attributes || {};
      const desc = `${attrs.usagetype || ''} ${attrs.groupDescription || ''} ${attrs.operation || ''}`;
      // AWS public IPv4 pricing lives in AmazonVPC. Prefer the in-use charge, not idle/IPAM.
      if (!/PublicIPv4|InUseAddress|Public IPv4/i.test(desc + JSON.stringify(attrs))) {
        continue;
      }
      if (/Idle|IPAM|ContiguousBlock/i.test(desc)) continue;
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
}

/** @deprecated Prefer fetchEbsGp3GbMonth — kept only if callers still sync synchronously. */
export function ebsHourly(ebsGb, gbMonthRate) {
  if (gbMonthRate == null || !Number.isFinite(gbMonthRate)) {
    throw new Error('EBS hourly requires live gp3 GB-month rate from Price List API');
  }
  return (Number(ebsGb) || 0) * (gbMonthRate / 730);
}
