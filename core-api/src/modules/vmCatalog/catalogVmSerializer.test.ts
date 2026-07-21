import assert from 'node:assert/strict';
import {
  stripProviderLeakFields,
  resolveDurationDays,
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
  const shaped = stripProviderLeakFields(sample, 'admin');
  assert.equal(shaped.provider, undefined);
  assert.equal(shaped.region, undefined);
  assert.equal(shaped.providerInstanceId, undefined);
  assert.equal(shaped.rawProviderCostPerHr, undefined);
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

test('specsToCanonicalSpec', () => {
  assert.equal(
    specsToCanonicalSpec({ cpu: '2 vCPU', ram: '8 GB', disk: '50 GB' }, 'linux'),
    '2vcpu-8gb-50gbssd'
  );
});

console.log('catalogVmSerializer: all tests passed');
