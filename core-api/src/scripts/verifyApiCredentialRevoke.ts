/**
 * Manual check: after revoke, loadActiveApiCredentialForToken must return null.
 * Usage: npx ts-node --transpile-only -r dotenv/config src/scripts/verifyApiCredentialRevoke.ts
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { ApiCredentialModel } from '../models/apiCredential.model';
import { signApiAccessToken, verifyApiAccessToken } from '../utils/jwt';
import { loadActiveApiCredentialForToken } from '../modules/publicApi/apiCredentialPublicAuth.service';

async function main(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);

  const doc = await ApiCredentialModel.findOne({ status: 'active' });
  if (!doc) {
    console.log('SKIP: no active ApiCredential in database');
    await mongoose.disconnect();
    return;
  }

  const token = signApiAccessToken({
    clientId: doc.clientId,
    credentialId: doc._id.toString(),
    ownerType: doc.ownerType,
    tenantId: doc.tenantId?.toString() ?? null,
    adminId: doc.adminId?.toString() ?? null,
    scopes: doc.scopes,
  });
  const payload = verifyApiAccessToken(token);
  if (!payload) {
    throw new Error('sign/verify failed');
  }

  const before = await loadActiveApiCredentialForToken(payload);
  await ApiCredentialModel.updateOne({ _id: doc._id }, { $set: { status: 'revoked' } });
  const after = await loadActiveApiCredentialForToken(payload);
  await ApiCredentialModel.updateOne({ _id: doc._id }, { $set: { status: 'active' } });

  console.log('before revoke:', before ? 'active credential loaded' : 'null');
  console.log('after revoke:', after ? 'STILL LOADED (bug)' : 'null (401 on public API)');

  await mongoose.disconnect();

  if (!before || after) {
    process.exitCode = 1;
    throw new Error('Revoke check failed');
  }
  console.log('PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
