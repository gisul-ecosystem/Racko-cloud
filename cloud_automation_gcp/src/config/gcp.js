import { GoogleAuth } from 'google-auth-library';
import { ProjectsClient } from '@google-cloud/resource-manager';
import { IAMCredentialsClient } from '@google-cloud/iam-credentials';
import { CloudBillingClient } from '@google-cloud/billing';
import { BudgetServiceClient } from '@google-cloud/billing-budgets';
import { Logging } from '@google-cloud/logging';
import { ImagesClient, InstancesClient, ZoneOperationsClient } from '@google-cloud/compute';
import { Storage } from '@google-cloud/storage';
import { ClusterManagerClient } from '@google-cloud/container';
import { ServicesClient as CloudRunClient } from '@google-cloud/run';
import { CloudFunctionsServiceClient } from '@google-cloud/functions';
import { SqlInstancesServiceClient } from '@google-cloud/sql';
import { BigQuery } from '@google-cloud/bigquery';
import { PubSub } from '@google-cloud/pubsub';
import { MetricServiceClient } from '@google-cloud/monitoring';
import { Firestore } from '@google-cloud/firestore';

// ─── Auth ──────────────────────────────────────────────────────────────────

const authConfig = process.env.GCP_SERVICE_ACCOUNT_KEY_PATH
  ? { keyFilename: process.env.GCP_SERVICE_ACCOUNT_KEY_PATH }
  : {}; // Falls back to Application Default Credentials (ADC) if no key file

export const auth = new GoogleAuth({
  ...authConfig,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/admin.directory.user',
  ],
});

// ─── Constants ─────────────────────────────────────────────────────────────

export const GCP_PROJECT_ID      = process.env.GCP_PROJECT_ID;
export const GCP_ORGANIZATION_ID = process.env.GCP_ORGANIZATION_ID;
export const GCP_BILLING_ACCOUNT = process.env.GCP_BILLING_ACCOUNT_ID;
export const GCP_FOLDER_ID       = process.env.GCP_FOLDER_ID || null;
export const GCP_DOMAIN          = process.env.GCP_DOMAIN;
export const GCP_ADMIN_EMAIL     = process.env.GCP_ADMIN_EMAIL;
export const GCP_DEFAULT_REGION  = process.env.GCP_DEFAULT_REGION || 'asia-south1';
export const GCP_DEFAULT_ZONE    = process.env.GCP_DEFAULT_ZONE   || 'asia-south1-a';

// ─── Resource Manager ──────────────────────────────────────────────────────

export const projectsClient = new ProjectsClient(authConfig);

// ─── IAM ───────────────────────────────────────────────────────────────────

export const iamCredentialsClient = new IAMCredentialsClient(authConfig);

// ─── Billing ───────────────────────────────────────────────────────────────

export const billingClient = new CloudBillingClient(authConfig);
export const budgetsClient = new BudgetServiceClient(authConfig);

// ─── Logging / Audit Logs ──────────────────────────────────────────────────

export const logging = new Logging({
  ...authConfig,
  projectId: GCP_PROJECT_ID,
});

// ─── Compute Engine ────────────────────────────────────────────────────────

export const computeInstancesClient = new InstancesClient(authConfig);
export const computeImagesClient    = new ImagesClient(authConfig);
export const computeZoneOpsClient   = new ZoneOperationsClient(authConfig);

// ─── Cloud Storage ─────────────────────────────────────────────────────────

export const storageClient = new Storage({
  ...authConfig,
  projectId: GCP_PROJECT_ID,
});

// ─── GKE ───────────────────────────────────────────────────────────────────

export const gkeClient = new ClusterManagerClient(authConfig);

// ─── Cloud Run ─────────────────────────────────────────────────────────────

export const cloudRunClient = new CloudRunClient(authConfig);

// ─── Cloud Functions ───────────────────────────────────────────────────────

export const cloudFunctionsClient = new CloudFunctionsServiceClient(authConfig);

// ─── Cloud SQL ─────────────────────────────────────────────────────────────

export const cloudSqlClient = new SqlInstancesServiceClient(authConfig);

// ─── BigQuery ──────────────────────────────────────────────────────────────

export const bigQueryClient = new BigQuery({
  ...authConfig,
  projectId: GCP_PROJECT_ID,
});

// ─── Pub/Sub ───────────────────────────────────────────────────────────────

export const pubSubClient = new PubSub({
  ...authConfig,
  projectId: GCP_PROJECT_ID,
});

// ─── Cloud Monitoring ──────────────────────────────────────────────────────

export const monitoringClient = new MetricServiceClient(authConfig);

// ─── Firestore ─────────────────────────────────────────────────────────────

export const firestoreClient = new Firestore({
  ...authConfig,
  projectId: GCP_PROJECT_ID,
});

// ─── Google APIs (Admin SDK for Cloud Identity) ────────────────────────────

export async function getGoogleAdminClient() {
  const { google } = await import('googleapis');
  const authClient = await auth.getClient();
  return google.admin({ version: 'directory_v1', auth: authClient });
}

// ─── Helper: get short-lived access token ──────────────────────────────────

export async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// ─── Validate config on startup ────────────────────────────────────────────

export function validateGcpConfig() {
  const missing = [];
  if (!GCP_PROJECT_ID)      missing.push('GCP_PROJECT_ID');
  if (!GCP_ORGANIZATION_ID) missing.push('GCP_ORGANIZATION_ID');
  if (!GCP_BILLING_ACCOUNT) missing.push('GCP_BILLING_ACCOUNT_ID');

  if (missing.length > 0) {
    console.warn(`[gcpConfig] Missing env vars: ${missing.join(', ')}. Provisioning will fail.`);
  } else {
    console.log('[gcpConfig] GCP config validated OK');
    console.log(`[gcpConfig] Project: ${GCP_PROJECT_ID} | Org: ${GCP_ORGANIZATION_ID} | Region: ${GCP_DEFAULT_REGION}`);
  }
}

// ─── GCP Region display names ───────────────────────────────────────────────

export const GCP_REGION_NAMES = {
  'asia-south1':        'Asia South (Mumbai)',
  'asia-south2':        'Asia South (Delhi)',
  'us-central1':        'US Central (Iowa)',
  'us-east1':           'US East (South Carolina)',
  'us-west1':           'US West (Oregon)',
  'europe-west1':       'Europe West (Belgium)',
  'europe-west2':       'Europe West (London)',
  'asia-southeast1':    'Asia Southeast (Singapore)',
  'asia-northeast1':    'Asia Northeast (Tokyo)',
  'australia-southeast1':'Australia Southeast (Sydney)',
};

export const GCP_SYNC_REGIONS = Object.keys(GCP_REGION_NAMES);
