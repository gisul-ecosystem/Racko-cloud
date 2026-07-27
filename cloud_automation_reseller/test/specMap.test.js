import test from 'node:test';
import assert from 'node:assert/strict';
import {
  specsToCanonical,
  parseCanonicalSpec,
  resolveSpecParts,
} from '../src/config/specMap.js';
import { resolveGcpSku, resolveOciSku, resolveAzureSku } from '../src/services/dynamicSkuResolver.js';
import { toPricingMode, pricingModeQuery } from '../src/models/CloudRegionPricing.js';
import { normalizeProviders, CLOUD_PROVIDERS } from '../src/config/cloudProviders.js';

test('specsToCanonical builds linux spec', () => {
  assert.equal(
    specsToCanonical({ cpu: '2 vCPU', ram: '8 GB', disk: '50 GB SSD' }, 'linux'),
    '2vcpu-8gb-50gbssd'
  );
});

test('specsToCanonical appends gpu suffix', () => {
  assert.equal(
    specsToCanonical({ cpu: '4', ram: '16', disk: '100' }, 'gpu'),
    '4vcpu-16gb-100gbssd-gpu'
  );
});

test('parseCanonicalSpec extracts parts', () => {
  assert.deepEqual(parseCanonicalSpec('16vcpu-64gb-400gbssd'), {
    vcpu: 16,
    ramGb: 64,
    diskGb: 400,
    gpu: false,
  });
});

test('resolveSpecParts prefers canonicalSpec', () => {
  const parts = resolveSpecParts(
    '16vcpu-64gb-400gbssd',
    { cpu: '2', ram: '8', disk: '50' },
    'linux'
  );
  assert.equal(parts.canonicalSpec, '16vcpu-64gb-400gbssd');
  assert.equal(parts.vcpu, 16);
  assert.equal(parts.ramGb, 64);
});

test('resolveGcpSku picks e2-standard-2 for 2vCPU/8GB', () => {
  const sku = resolveGcpSku({ vcpu: 2, ramGb: 8, diskGb: 50 });
  assert.equal(sku.machineType, 'e2-standard-2');
  assert.equal(sku.diskGb, 50);
});

test('resolveGcpSku nested mode uses n2 not e2', () => {
  const sku = resolveGcpSku({
    vcpu: 2,
    ramGb: 8,
    diskGb: 50,
    nestedVirtualization: true,
  });
  assert.equal(sku.machineType, 'n2-standard-2');
  assert.equal(sku.source, 'dynamic_nested');
});

test('resolveGcpSku adds T4 for gpu specs', () => {
  const sku = resolveGcpSku({ vcpu: 4, ramGb: 16, diskGb: 100, gpu: true });
  assert.equal(sku.machineType, 'n1-standard-4');
  assert.equal(sku.acceleratorType, 'nvidia-tesla-t4');
});

test('resolveOciSku nested mode prefers Intel Standard3.Flex', () => {
  const normal = resolveOciSku({ vcpu: 4, ramGb: 16, diskGb: 100 });
  const nested = resolveOciSku({
    vcpu: 4,
    ramGb: 16,
    diskGb: 100,
    nestedVirtualization: true,
  });
  assert.equal(normal.shape, 'VM.Standard.E4.Flex');
  assert.equal(nested.shape, 'VM.Standard3.Flex');
});

test('resolveAzureSku nested mode fails closed without Azure credentials', async () => {
  await assert.rejects(
    () =>
      resolveAzureSku({
        vcpu: 2,
        ramGb: 4,
        diskGb: 50,
        nestedVirtualization: true,
      }),
    /AZURE_SUBSCRIPTION_ID|Azure|credential|login|DefaultAzureCredential/i
  );
});

test('toPricingMode and pricingModeQuery', () => {
  assert.equal(toPricingMode(true), 'nested');
  assert.equal(toPricingMode(false), 'normal');
  assert.equal(toPricingMode('true'), 'nested');
  assert.deepEqual(pricingModeQuery('nested'), { pricingMode: 'nested' });
  assert.ok(pricingModeQuery('normal').$or);
});

test('normalizeProviders defaults to all cloud providers', () => {
  assert.deepEqual(normalizeProviders(undefined), CLOUD_PROVIDERS);
  assert.deepEqual(normalizeProviders([]), CLOUD_PROVIDERS);
});

test('normalizeProviders accepts single provider', () => {
  assert.deepEqual(normalizeProviders(['azure']), ['azure']);
  assert.deepEqual(normalizeProviders('azure'), ['azure']);
});

test('normalizeProviders accepts comma string and dedupes', () => {
  assert.deepEqual(normalizeProviders('aws,azure,aws'), ['aws', 'azure']);
});

test('normalizeProviders rejects invalid provider', () => {
  assert.throws(() => normalizeProviders(['webyne']), /Invalid providers/);
});
