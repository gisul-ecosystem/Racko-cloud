import test from 'node:test';
import assert from 'node:assert/strict';
import { toSelectResult } from '../src/services/providerSelector.js';

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
