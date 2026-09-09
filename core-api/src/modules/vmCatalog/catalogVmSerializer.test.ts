import assert from 'node:assert/strict';
import {
  stripProviderLeakFields,
  resolveDurationDays,
  computeExpiresFrom,
  hasFixedProviderTerm,
  specsToCanonicalSpec,
} from './catalogVmSerializer';
import type { CatalogVmResponse } from './vmCatalog.types';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`fail — ${name}`);
    throw err;
  }
}

const sample: CatalogVmResponse = {
  _id: '1',
  adminId: '2',
  provider: 'aws',
  category: 'linux',
  planId: 'p1',
  planName: 'Plan',
  specs: {},
  billing: 'hourly',
  quantity: 1,
  template: { value: 'u', label: 'Ubuntu' },
  pricingSnapshot: { currency: 'INR', total: 100 },
  status: 'active',
  region: 'ap-south-1',
  providerInstanceId: 'i-abc',
  rawProviderCostPerHr: 0.05,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test('admin role never receives provider identity fields', () => {
  const shaped = stripProviderLeakFields({ ...sample, externalRef: 'wb-123' }, 'admin');
  assert.equal(shaped.provider, undefined);
  assert.equal(shaped.region, undefined);
  assert.equal(shaped.providerInstanceId, undefined);
  assert.equal(shaped.rawProviderCostPerHr, undefined);
  assert.equal(shaped.externalRef, undefined);
  assert.equal(shaped.planName, 'Plan');
  assert.equal(shaped.status, 'active');
});

test('super_admin retains provider identity fields', () => {
  const shaped = stripProviderLeakFields(sample, 'super_admin');
  assert.equal(shaped.provider, 'aws');
  assert.equal(shaped.region, 'ap-south-1');
  assert.equal(shaped.providerInstanceId, 'i-abc');
  assert.equal(shaped.rawProviderCostPerHr, 0.05);
});

test('resolveDurationDays maps billing periods', () => {
  assert.equal(resolveDurationDays('hourly'), 1);
  assert.equal(resolveDurationDays('monthly'), 30);
  assert.equal(resolveDurationDays('yearly'), 365);
  assert.equal(resolveDurationDays('hourly', 2), 2);
});

test('hasFixedProviderTerm excludes continuously billed plans', () => {
  assert.equal(hasFixedProviderTerm('monthly'), true);
  assert.equal(hasFixedProviderTerm('quarterly'), true);
  assert.equal(hasFixedProviderTerm('yearly'), true);
  assert.equal(hasFixedProviderTerm('hourly'), false);
  assert.equal(hasFixedProviderTerm('daily'), false);
});

test('computeExpiresFrom counts the term from the attach date', () => {
  const attached = new Date('2026-01-15T10:30:00.000Z');
  assert.equal(
    computeExpiresFrom(attached, resolveDurationDays('monthly')).toISOString(),
    '2026-02-14T10:30:00.000Z'
  );
  // Spans a leap day and a year boundary without drifting.
  assert.equal(
    computeExpiresFrom(new Date('2028-02-27T00:00:00.000Z'), 3).toISOString(),
    '2028-03-01T00:00:00.000Z'
  );
  assert.equal(
    computeExpiresFrom(new Date('2026-12-30T00:00:00.000Z'), 7).toISOString(),
    '2027-01-06T00:00:00.000Z'
  );
  // A zero or negative term still lands in the future, never on the start day.
  assert.equal(
    computeExpiresFrom(new Date('2026-01-15T00:00:00.000Z'), 0).toISOString(),
    '2026-01-16T00:00:00.000Z'
  );
});

test('specsToCanonicalSpec', () => {
  assert.equal(
    specsToCanonicalSpec({ cpu: '2 vCPU', ram: '8 GB', disk: '50 GB' }, 'linux'),
    '2vcpu-8gb-50gbssd'
  );
});

console.log('catalogVmSerializer: all tests passed');
