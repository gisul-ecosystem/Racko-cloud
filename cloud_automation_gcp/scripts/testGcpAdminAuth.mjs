import 'dotenv/config';
import {
  ADMIN_DIRECTORY_USER_SCOPE,
  GCP_ADMIN_EMAIL,
  GCP_DOMAIN,
  formatDomainWideDelegationHelp,
  getGoogleAdminClient,
  getServiceAccountClientId,
} from '../src/config/gcp.js';

async function testAdminAuth() {
  console.log('Testing Cloud Identity / Admin SDK access...');
  console.log(`  Domain: ${GCP_DOMAIN}`);
  console.log(`  Impersonating: ${GCP_ADMIN_EMAIL}`);
  console.log(`  Service account client ID: ${getServiceAccountClientId() || 'unknown'}`);
  console.log(`  Scope: ${ADMIN_DIRECTORY_USER_SCOPE}`);

  try {
    const admin = await getGoogleAdminClient();
    const result = await admin.users.list({
      domain: GCP_DOMAIN,
      maxResults: 1,
      orderBy: 'email',
    });
    const sample = result.data.users?.[0]?.primaryEmail || '(no users returned)';
    console.log('✅ Admin SDK authorized');
    console.log(`   Sample user lookup OK (${sample})`);
  } catch (err) {
    console.error('❌ Admin SDK auth failed');
    console.error(formatDomainWideDelegationHelp(err));
    process.exitCode = 1;
  }
}

testAdminAuth();
