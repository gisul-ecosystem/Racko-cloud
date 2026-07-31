import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAwsPublicIpHourly } from '../src/services/awsPriceFetch.js';
import { azureDiskSkuCode, pickAzureVmHourly } from '../src/services/azurePricing.js';
import { computeGcpHourly } from '../src/services/gcpPricing.js';
import { isStorageRowAnomalous, toSelectResult } from '../src/services/providerSelector.js';

function baseRow(overrides = {}) {
  return {
    provider: 'azure',
    region: 'centralindia',
    category: 'linux',
    canonicalSpec: '2vcpu-8gb-50gbssd',
    pricingMode: 'normal',
    rawComputePricePerHr: 0.04,
    rawStoragePricePerHr: 0.01,
    rawIpPricePerHr: 0.005,
    rawTotalPricePerHr: 0.055,
    instanceType: 'Standard_D2s_v3',
    currency: 'USD',
    fetchedAt: new Date('2026-07-22T00:00:00.000Z'),
    ...overrides,
  };
}

test('toSelectResult exposes public IP and zero private IP', () => {
  const result = toSelectResult(baseRow(), 'cheapest_cloud', ['azure']);

  assert.equal(result.rawPublicIpPricePerHr, 0.005);
  assert.equal(result.rawPrivateIpPricePerHr, 0);
  assert.equal(result.rawIpPricePerHr, 0.005);
  assert.equal(result.rawIpPricePerHr, result.rawPublicIpPricePerHr);
});

test('toSelectResult totals: public includes IP, private is compute+storage only', () => {
  const row = baseRow({
    rawComputePricePerHr: 0.04,
    rawStoragePricePerHr: 0.01,
    rawIpPricePerHr: 0.005,
    rawTotalPricePerHr: 0.055,
  });
  const result = toSelectResult(row, 'cheapest_cloud', ['azure']);

  assert.equal(result.rawTotalWithPublicIpPerHr, 0.055);
  assert.equal(result.rawTotalPricePerHr, 0.055);
  assert.equal(result.rawTotalWithPrivateIpPerHr, 0.05);
  assert.equal(
    Math.round(
      (result.rawTotalWithPublicIpPerHr - result.rawTotalWithPrivateIpPerHr) * 1e8
    ) / 1e8,
    result.rawPublicIpPricePerHr
  );
  assert.equal(result.rawTotalWithPrivateIpPerHr, 0.05);
});

test('toSelectResult private IP total ignores public IP even when IP is large', () => {
  const result = toSelectResult(
    baseRow({
      rawComputePricePerHr: 0.1,
      rawStoragePricePerHr: 0.02,
      rawIpPricePerHr: 0.05,
      rawTotalPricePerHr: 0.17,
    }),
    'cheapest_cloud',
    ['aws']
  );

  assert.equal(result.rawPrivateIpPricePerHr, 0);
  assert.equal(result.rawTotalWithPrivateIpPerHr, 0.12);
  assert.equal(result.rawTotalWithPublicIpPerHr, 0.17);
  assert.equal(
    Math.round(
      (result.rawTotalWithPublicIpPerHr - result.rawTotalWithPrivateIpPerHr) * 1e8
    ) / 1e8,
    result.rawPublicIpPricePerHr
  );
});

test('toSelectResult treats missing IP as $0 public and equal totals', () => {
  const result = toSelectResult(
    baseRow({
      rawIpPricePerHr: undefined,
      rawTotalPricePerHr: 0.05,
      rawComputePricePerHr: 0.04,
      rawStoragePricePerHr: 0.01,
    }),
    'cheapest_cloud',
    ['oci']
  );

  assert.equal(result.rawPublicIpPricePerHr, 0);
  assert.equal(result.rawPrivateIpPricePerHr, 0);
  assert.equal(result.rawTotalWithPublicIpPerHr, 0.05);
  assert.equal(result.rawTotalWithPrivateIpPerHr, 0.05);
});

test('toSelectResult rebuilds public total from parts when stored total missing', () => {
  const result = toSelectResult(
    baseRow({
      rawComputePricePerHr: 0.03,
      rawStoragePricePerHr: 0.01,
      rawIpPricePerHr: 0.004,
      rawTotalPricePerHr: undefined,
    }),
    'cheapest_cloud_dynamic',
    ['azure']
  );

  assert.equal(result.rawTotalWithPublicIpPerHr, 0.044);
  assert.equal(result.rawTotalPricePerHr, 0.044);
  assert.equal(result.rawTotalWithPrivateIpPerHr, 0.04);
});

test('toSelectResult preserves nested pricingMode flag', () => {
  const result = toSelectResult(
    baseRow({ pricingMode: 'nested' }),
    'cheapest_cloud_nested',
    ['azure', 'oci']
  );

  assert.equal(result.pricingMode, 'nested');
  assert.equal(result.nestedVirtualization, true);
  assert.deepEqual(result.providersUsed, ['azure', 'oci']);
});

test('toSelectResult storage_only zeroes compute and IP totals', () => {
  const result = toSelectResult(baseRow(), 'storage_only_cheapest', ['azure'], {
    storageOnly: true,
  });

  assert.equal(result.mode, 'storage_only');
  assert.equal(result.rawComputePricePerHr, 0);
  assert.equal(result.rawPublicIpPricePerHr, 0);
  assert.equal(result.rawPrivateIpPricePerHr, 0);
  assert.equal(result.rawTotalPricePerHr, 0.01);
  assert.equal(result.rawTotalWithPublicIpPerHr, 0.01);
  assert.equal(result.rawTotalWithPrivateIpPerHr, 0.01);
});

test('isStorageRowAnomalous flags a 1024 GB tier cheaper than smaller siblings', () => {
  const row = baseRow({
    canonicalSpec: '2vcpu-8gb-1024gbssd',
    rawStoragePricePerHr: 977.62 / 730,
  });
  const siblings = [
    baseRow({
      canonicalSpec: '2vcpu-8gb-128gbssd',
      rawStoragePricePerHr: (128 * 2.44) / 730,
    }),
    baseRow({
      canonicalSpec: '2vcpu-8gb-256gbssd',
      rawStoragePricePerHr: (256 * 2.44) / 730,
    }),
    baseRow({
      canonicalSpec: '2vcpu-8gb-512gbssd',
      rawStoragePricePerHr: 1252.33 / 730,
    }),
  ];

  assert.equal(isStorageRowAnomalous(row, siblings, 1024), true);
});

test('computeGcpHourly uses different storage rates for HDD vs SSD', () => {
  const base = {
    machineType: 'e2-standard-2',
    diskGb: 128,
    rates: {
      e2CorePerHr: 0.02,
      e2RamGbPerHr: 0.003,
      n1CorePerHr: 0.03,
      n1RamGbPerHr: 0.004,
      pdBalancedGbPerMonth: 0.12,
      pdStandardGbPerMonth: 0.04,
      publicIpPerHr: 0.005,
      source: 'api',
    },
  };

  const ssd = computeGcpHourly({ ...base, diskType: 'standard_ssd' });
  const hdd = computeGcpHourly({ ...base, diskType: 'standard_hdd' });

  assert.notEqual(ssd.rawStoragePricePerHr, hdd.rawStoragePricePerHr);
  assert.ok(ssd.rawStoragePricePerHr > hdd.rawStoragePricePerHr);
});

test('azureDiskSkuCode maps exact disk sizes to LRS SKU families', () => {
  assert.equal(azureDiskSkuCode(128, 'standard_ssd'), 'E10');
  assert.equal(azureDiskSkuCode(512, 'standard_ssd'), 'E20');
  assert.equal(azureDiskSkuCode(128, 'standard_hdd'), 'S10');
  assert.equal(azureDiskSkuCode(512, 'standard_hdd'), 'S20');
  assert.equal(azureDiskSkuCode(48, 'standard_ssd'), 'E6');
});

test('pickAzureVmHourly ignores Low Priority and Cloud Services rows', () => {
  const price = pickAzureVmHourly(
    [
      {
        productName: 'Virtual Machines Dplsv5 Series',
        meterName: 'D2pls v5 Low Priority',
        skuName: 'Standard_D2pls_v5 Low Priority',
        type: 'Consumption',
        unitOfMeasure: '1 Hour',
        retailPrice: 0.0136,
      },
      {
        productName: 'Virtual Machines Dplsv5 Series',
        meterName: 'D2pls v5',
        skuName: 'Standard_D2pls_v5',
        type: 'Consumption',
        unitOfMeasure: '1 Hour',
        retailPrice: 0.068,
      },
      {
        productName: 'Dasv5 Series Cloud Services',
        meterName: 'D2as v5',
        skuName: 'Standard_D2as_v5',
        type: 'Consumption',
        unitOfMeasure: '1 Hour',
        retailPrice: 0.213,
      },
    ],
    { windows: false }
  );

  assert.equal(price, 0.068);
});

test('pickAwsPublicIpHourly prefers in-use public IPv4 over idle rows', () => {
  const priceList = [
    JSON.stringify({
      product: {
        attributes: {
          group: 'VPCPublicIPv4Address',
          groupDescription: 'Hourly charge for Idle Public IPv4 Addresses',
          usagetype: 'APS3-PublicIPv4:IdleAddress',
        },
      },
      terms: {
        OnDemand: {
          idle: {
            priceDimensions: {
              idleDim: {
                unit: 'Hrs',
                description: '$0.005 per Idle public IPv4 address per hour',
                pricePerUnit: { USD: '0.0050000000' },
              },
            },
          },
        },
      },
    }),
    JSON.stringify({
      product: {
        attributes: {
          group: 'VPCPublicIPv4Address',
          groupDescription: 'Hourly charge for In-use Public IPv4 Addresses',
          usagetype: 'APS3-PublicIPv4:InUseAddress',
        },
      },
      terms: {
        OnDemand: {
          inuse: {
            priceDimensions: {
              inuseDim: {
                unit: 'Hrs',
                description: '$0.005 per In-use public IPv4 address per hour',
                pricePerUnit: { USD: '0.0050000000' },
              },
            },
          },
        },
      },
    }),
  ];

  assert.equal(pickAwsPublicIpHourly(priceList), 0.005);
});
