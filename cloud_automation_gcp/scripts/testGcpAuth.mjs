import 'dotenv/config';
import { auth, GCP_PROJECT_ID, GCP_ORGANIZATION_ID } from '../src/config/gcp.js';

async function testAuth() {
  try {
    console.log('Testing GCP authentication...');
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (token.token) {
      console.log('✅ GCP auth successful');
      console.log(`   Project: ${GCP_PROJECT_ID}`);
      console.log(`   Org: ${GCP_ORGANIZATION_ID}`);
      console.log(`   Token (first 20 chars): ${token.token.substring(0, 20)}...`);
    }

    // Test project access
    const { ProjectsClient } = await import('@google-cloud/resource-manager');
    const projectsClient = new ProjectsClient({ keyFilename: process.env.GCP_SERVICE_ACCOUNT_KEY_PATH });
    const [project] = await projectsClient.getProject({ name: `projects/${GCP_PROJECT_ID}` });
    console.log(`✅ Project access confirmed: ${project.displayName}`);

  } catch (err) {
    console.error('❌ GCP auth failed:', err.message);
    console.error('   Check GCP_SERVICE_ACCOUNT_KEY_PATH and permissions');
  }
  process.exit(0);
}

testAuth();
