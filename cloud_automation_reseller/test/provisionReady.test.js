import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterProvisionReadyProviders,
  isProvisionReady,
} from '../src/config/provisionReady.js';

test('isProvisionReady returns false for OCI when credentials are missing', () => {
  assert.equal(isProvisionReady('oci'), false);
});

test('isProvisionReady returns false for unknown providers', () => {
  assert.equal(isProvisionReady('webyne'), false);
  assert.equal(isProvisionReady(''), false);
});

test('filterProvisionReadyProviders drops unconfigured clouds', () => {
  assert.deepEqual(filterProvisionReadyProviders(['aws', 'oci', 'azure']), []);
});
