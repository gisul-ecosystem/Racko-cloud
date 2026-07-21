/**
 * GCP config for reseller pricing + Compute Engine provisioning.
 * Pricing can use Cloud Billing Catalog (API key or SA); falls back to list rates if neither set.
 * Provisioning needs project + credentials + zone.
 */

import fs from 'fs';
import { GoogleAuth } from 'google-auth-library';

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
  region: process.env.GCP_REGION || 'asia-south1',
  zone: process.env.GCP_ZONE || 'asia-south1-a',
  network: process.env.GCP_NETWORK || 'default',
  subnetwork: process.env.GCP_SUBNETWORK || '',
  imageFamily: process.env.GCP_IMAGE_FAMILY || 'ubuntu-2204-lts',
  imageProject: process.env.GCP_IMAGE_PROJECT || 'ubuntu-os-cloud',
  sshPublicKey: process.env.GCP_SSH_PUBLIC_KEY || '',
  apiKey: process.env.GCP_API_KEY || '',
  keyFilename,
  credentials: credentialsJson,
};

export function gcpClientOptions() {
  const opts = {};
  if (gcpConfig.credentials) opts.credentials = gcpConfig.credentials;
  else if (gcpConfig.keyFilename) opts.keyFilename = gcpConfig.keyFilename;
  if (gcpConfig.projectId) opts.projectId = gcpConfig.projectId;
  return opts;
}

export function validateGcpConfig({ forProvision = false } = {}) {
  if (!forProvision) return;
  const missing = [];
  if (!gcpConfig.projectId) missing.push('GCP_PROJECT_ID');
  if (!gcpConfig.keyFilename && !gcpConfig.credentials) {
    missing.push('GCP_SERVICE_ACCOUNT_KEY_PATH or GCP_SERVICE_ACCOUNT_KEY');
  }
  if (!gcpConfig.zone) missing.push('GCP_ZONE');
  if (missing.length) {
    throw new Error(`GCP provision requires: ${missing.join(', ')}`);
  }
}

/**
 * Access token for Cloud Billing Catalog (optional — pricing also accepts GCP_API_KEY).
 */
export async function getGcpAccessToken() {
  try {
    const authOpts = {
      scopes: [
        'https://www.googleapis.com/auth/cloud-billing.readonly',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    };
    if (gcpConfig.credentials) authOpts.credentials = gcpConfig.credentials;
    else if (gcpConfig.keyFilename) authOpts.keyFilename = gcpConfig.keyFilename;
    const auth = new GoogleAuth(authOpts);
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token?.token || null;
  } catch (err) {
    console.warn(
      '[gcp] Could not obtain billing API token:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** Map region code → Cloud Billing Catalog description fragment. */
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
};

/** Zone → region (first two hyphen parts). */
export function zoneToRegion(zone) {
  const z = String(zone || '');
  const m = z.match(/^([a-z]+-[a-z]+\d+)/);
  return m ? m[1] : gcpConfig.region;
}
