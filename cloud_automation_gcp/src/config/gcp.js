import fs from 'fs';
import path from 'path';
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

function loadCredentials() {
  if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
    } catch {
      console.warn('[gcp] GCP_SERVICE_ACCOUNT_KEY is not valid JSON');
    }
  }
  return null;
}

const credentialsJson = loadCredentials();
const keyFilename = process.env.GCP_SERVICE_ACCOUNT_KEY_PATH || '';

export const gcpConfig = {
  projectId: process.env.GCP_PROJECT_ID || '',
  region: process.env.GCP_DEFAULT_REGION || 'asia-south1',
  zone: process.env.GCP_DEFAULT_ZONE || 'asia-south1-a',
  apiKey: process.env.GCP_API_KEY || '',
  keyFilename,
  credentials: credentialsJson,
};

function resolveAuthConfig() {
  if (gcpConfig.credentials) {
    return { credentials: gcpConfig.credentials };
  }
  if (gcpConfig.keyFilename) {
    const resolved = path.resolve(gcpConfig.keyFilename);
    if (fs.existsSync(resolved)) {
      return { keyFilename: resolved };
    }
  }
  return {};
}

export function hasGcpPricingAuth() {
  if (gcpConfig.apiKey) return true;
  if (gcpConfig.credentials) return true;
  if (gcpConfig.keyFilename) {
    return fs.existsSync(path.resolve(gcpConfig.keyFilename));
  }
  return false;
}

const authConfig = resolveAuthConfig();

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

export async function getGcpAccessToken() {
  if (!hasGcpPricingAuth()) return null;

  try {
    const authOpts = {
      scopes: [
        'https://www.googleapis.com/auth/cloud-billing.readonly',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    };
    if (gcpConfig.credentials) authOpts.credentials = gcpConfig.credentials;
    else if (gcpConfig.keyFilename && fs.existsSync(path.resolve(gcpConfig.keyFilename))) {
      authOpts.keyFilename = path.resolve(gcpConfig.keyFilename);
    } else {
      return null;
    }
    const billingAuth = new GoogleAuth(authOpts);
    const client = await billingAuth.getClient();
    const token = await client.getAccessToken();
    return token?.token || null;
  } catch (err) {
    console.warn('[gcp] Could not obtain billing API token:', err instanceof Error ? err.message : err);
    return null;
  }
}

export const GCP_REGION_BILLING_NAMES = {
  'asia-south1': 'Mumbai',
  'asia-south2': 'Delhi',
  'asia-southeast1': 'Singapore',
  'us-central1': 'Iowa',
  'us-east1': 'South Carolina',
  'us-west1': 'Oregon',
  'europe-west1': 'Belgium',
  'europe-west2': 'London',
  'europe-west3': 'Frankfurt',
  'asia-northeast1': 'Tokyo',
  'australia-southeast1': 'Sydney',
};

// ─── Google APIs (Admin SDK for Cloud Identity) ────────────────────────────

export const ADMIN_DIRECTORY_USER_SCOPE =
  'https://www.googleapis.com/auth/admin.directory.user';

function loadServiceAccountJson() {
  if (gcpConfig.credentials) {
    return gcpConfig.credentials;
  }

  if (gcpConfig.keyFilename) {
    const resolved = path.resolve(gcpConfig.keyFilename);
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    }
  }

  throw new Error(
    'GCP service account key not found. Set GCP_SERVICE_ACCOUNT_KEY_PATH or GCP_SERVICE_ACCOUNT_KEY.'
  );
}

export function getServiceAccountClientId() {
  try {
    return String(loadServiceAccountJson().client_id || '').trim() || null;
  } catch {
    return null;
  }
}

export function getAdminSdkEnableUrl(projectId = GCP_PROJECT_ID) {
  const project = projectId || 'racko-master-project-505113';
  return `https://console.cloud.google.com/apis/library/admin.googleapis.com?project=${encodeURIComponent(project)}`;
}

export function formatAdminSdkHelp(err) {
  const enableUrl = getAdminSdkEnableUrl();
  const base =
    `Google Admin SDK API is not enabled on GCP project ${GCP_PROJECT_ID || 'racko-master-project-505113'}.\n` +
    `Enable it here (requires Project Owner or Service Usage Admin):\n${enableUrl}\n` +
    `Then wait 2–5 minutes and retry provisioning.`;

  if (err?.message) {
    return `${base}\n\nGoogle error: ${err.message}`;
  }

  return base;
}

export function formatDomainWideDelegationHelp(err) {
  const message = String(err?.message || '');
  if (
    message.includes('admin.googleapis.com') ||
    message.includes('Admin SDK API has not been used') ||
    message.includes('SERVICE_DISABLED')
  ) {
    return formatAdminSdkHelp(err);
  }

  const clientId = getServiceAccountClientId();
  const clientHint = clientId ? `Client ID: ${clientId}` : 'service account Client ID from gcp-key.json';
  const base =
    `Cloud Identity admin access is not authorized. Ask your Google Workspace super admin to:\n` +
    `1) GCP Console → IAM → Service Accounts → enable Domain-wide delegation for racko-lab-automation\n` +
    `2) admin.google.com → Security → API controls → Domain-wide delegation → Add ${clientHint}\n` +
    `   Scope: ${ADMIN_DIRECTORY_USER_SCOPE}\n` +
    `3) Ensure ${GCP_ADMIN_EMAIL || 'GCP_ADMIN_EMAIL'} is a Workspace super admin`;

  if (err?.message) {
    return `${base}\n\nGoogle error: ${err.message}`;
  }

  return base;
}

export async function getGoogleAdminClient() {
  const { google } = await import('googleapis');
  const { JWT } = await import('google-auth-library');

  if (!GCP_ADMIN_EMAIL) {
    throw new Error('GCP_ADMIN_EMAIL is required to create Cloud Identity users.');
  }

  const keys = loadServiceAccountJson();
  const jwtClient = new JWT({
    email: keys.client_email,
    key: keys.private_key,
    scopes: [ADMIN_DIRECTORY_USER_SCOPE],
    subject: GCP_ADMIN_EMAIL,
  });

  try {
    await jwtClient.authorize();
  } catch (err) {
    const message = formatDomainWideDelegationHelp(err);
    const error = new Error(message);
    error.code = 'GCP_DOMAIN_WIDE_DELEGATION_MISSING';
    throw error;
  }

  return google.admin({ version: 'directory_v1', auth: jwtClient });
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
  if (!GCP_PROJECT_ID) missing.push('GCP_PROJECT_ID');
  if (!GCP_ORGANIZATION_ID) missing.push('GCP_ORGANIZATION_ID');

  if (missing.length > 0) {
    console.warn(`[gcpConfig] Missing required env vars: ${missing.join(', ')}`);
    return;
  }

  if (!GCP_BILLING_ACCOUNT) {
    console.warn(
      '[gcpConfig] GCP_BILLING_ACCOUNT_ID not set — shared master project mode (users + IAM + email only).'
    );
  } else {
    console.log('[gcpConfig] GCP config validated OK');
  }

  console.log(
    `[gcpConfig] Project: ${GCP_PROJECT_ID} | Org: ${GCP_ORGANIZATION_ID} | Region: ${GCP_DEFAULT_REGION}`
  );
  console.log(
    `[gcpConfig] Cloud Identity user provisioning requires Admin SDK API: ${getAdminSdkEnableUrl()}`
  );
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
