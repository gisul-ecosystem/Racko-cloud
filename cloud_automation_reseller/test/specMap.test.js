import test from 'node:test';
import assert from 'node:assert/strict';
import {
  specsToCanonical,
  parseCanonicalSpec,
  resolveSpecParts,
} from '../src/config/specMap.js';

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
