import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { credentialMatchesApiAccessToken } from './apiCredentialPublicAuth.service';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`fail — ${name}`);
    throw err;
  }
}

const tenantId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();

test('tenant credential matches tenant token', () => {
  assert.equal(
    credentialMatchesApiAccessToken(
      { ownerType: 'tenant', tenantId, adminId: null },
      { ownerType: 'tenant', tenantId: tenantId.toString() }
    ),
    true
  );
});

test('platform credential matches platform token', () => {
  assert.equal(
    credentialMatchesApiAccessToken(
      { ownerType: 'platform', tenantId: null, adminId },
      { ownerType: 'platform', adminId: adminId.toString() }
    ),
    true
  );
});

test('ownerType mismatch rejects', () => {
  assert.equal(
    credentialMatchesApiAccessToken(
      { ownerType: 'tenant', tenantId, adminId: null },
      { ownerType: 'platform', adminId: adminId.toString() }
    ),
    false
  );
});

test('tenantId mismatch rejects', () => {
  assert.equal(
    credentialMatchesApiAccessToken(
      { ownerType: 'tenant', tenantId, adminId: null },
      { ownerType: 'tenant', tenantId: new mongoose.Types.ObjectId().toString() }
    ),
    false
  );
});

console.log('apiCredentialPublicAuth tests passed');
