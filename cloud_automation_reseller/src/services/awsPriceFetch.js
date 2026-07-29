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

function awsVolumeApiName(diskType = 'standard_ssd') {
  return diskType === 'standard_hdd' ? 'st1' : 'gp3';
}

/**
 * Live EBS USD per GB-month for a region and disk type (Price List API).
 */
export async function fetchEbsGbMonth(regionCode, diskType = 'standard_ssd') {
  const volumeApiName = awsVolumeApiName(diskType);
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
}

export async function fetchEbsGp3GbMonth(regionCode) {
  return fetchEbsGbMonth(regionCode, 'standard_ssd');
}

function extractHourlyUsdFromProduct(product) {
  const onDemand = product.terms?.OnDemand;
  if (!onDemand) return null;
  const term = onDemand[Object.keys(onDemand)[0]];
  const dims = term?.priceDimensions;
  if (!dims) return null;
  const dim = dims[Object.keys(dims)[0]];
  if (!/Hrs|Hours|Hour/i.test(dim?.unit || '')) return null;
  const unitPrice = parseFloat(dim?.pricePerUnit?.USD ?? 'NaN');
  return Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : null;
}

export function pickAwsPublicIpHourly(priceList) {
  let best = null;
  let bestScore = 0;

  for (const raw of priceList || []) {
    try {
      const product = JSON.parse(raw);
      const attrs = product.product?.attributes || {};
      const onDemand = product.terms?.OnDemand;
      const term = onDemand ? onDemand[Object.keys(onDemand)[0]] : null;
      const dims = term?.priceDimensions;
      const dim = dims ? dims[Object.keys(dims)[0]] : null;
      const blob = [
        attrs.usagetype,
        attrs.groupDescription,
        attrs.group,
        attrs.operation,
        attrs.productFamily,
        dim?.description,
        JSON.stringify(attrs),
      ]
        .filter(Boolean)
        .join(' ');

      if (!/PublicIPv4|Public IPv4|Public IP|VPCPublicIPv4|ElasticIP|IP Address/i.test(blob)) {
        continue;
      }

      const unitPrice = extractHourlyUsdFromProduct(product);
      if (unitPrice == null) continue;

      const inUse = /InUseAddress|InUse|In-use|In use/i.test(blob);
      const idle = /IdleAddress|Idle/i.test(blob);
      const ipam = /IPAM|ContiguousBlock/i.test(blob);
      const score =
        (inUse ? 100 : 0)
        + (!idle ? 20 : 0)
        + (!ipam ? 10 : -20)
        + (unitPrice > 0 ? 1 : 0);

      if (score > bestScore) {
        bestScore = score;
        best = unitPrice;
      }
    } catch {
      /* ignore malformed row */
    }
  }

  return best;
}

/**
 * Live public IPv4 / Elastic IP in-use USD/hr for a region.
 */
export async function fetchAwsPublicIpHourly(regionCode) {
  const filterSets = [
    [
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
      { Type: 'TERM_MATCH', Field: 'group', Value: 'VPCPublicIPv4Address' },
    ],
    [
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
      { Type: 'TERM_MATCH', Field: 'group', Value: 'IP Address' },
    ],
    [
      { Type: 'TERM_MATCH', Field: 'regionCode', Value: regionCode },
      { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'IP Address' },
    ],
  ];

  let best = null;

  for (const serviceCode of ['AmazonVPC', 'AmazonEC2']) {
    for (const filters of filterSets) {
      const command = new GetProductsCommand({
        ServiceCode: serviceCode,
        Filters: filters,
        MaxResults: 25,
      });
      const res = await pricingClient.send(command);
      const picked = pickAwsPublicIpHourly(res.PriceList);
      if (picked != null && picked > 0) return picked;
      if (picked != null) best = picked;
    }
  }

  if (best != null) return best;
  throw new Error(`AWS Price List missing public IPv4 hourly rate for ${regionCode}`);
}

/** @deprecated Prefer fetchEbsGp3GbMonth — kept only if callers still sync synchronously. */
export function ebsHourly(ebsGb, gbMonthRate) {
  if (gbMonthRate == null || !Number.isFinite(gbMonthRate)) {
    throw new Error('EBS hourly requires live gp3 GB-month rate from Price List API');
  }
  return (Number(ebsGb) || 0) * (gbMonthRate / 730);
}
