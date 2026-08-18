export const GCP_API_BASE = '/api/v1/cloud-automation-gcp';

export const GCP_DEFAULT_REGION = 'asia-south1';

export const GCP_REGIONS = [
  { code: 'asia-south1', name: 'Asia South (Mumbai)', location: 'Asia Pacific' },
  { code: 'asia-south2', name: 'Asia South (Delhi)', location: 'Asia Pacific' },
  { code: 'us-central1', name: 'US Central (Iowa)', location: 'US' },
  { code: 'us-east1', name: 'US East (South Carolina)', location: 'US' },
  { code: 'us-west1', name: 'US West (Oregon)', location: 'US' },
  { code: 'europe-west1', name: 'Europe West (Belgium)', location: 'Europe' },
  { code: 'europe-west2', name: 'Europe West (London)', location: 'Europe' },
  { code: 'asia-southeast1', name: 'Asia Southeast (Singapore)', location: 'Asia Pacific' },
  { code: 'asia-northeast1', name: 'Asia Northeast (Tokyo)', location: 'Asia Pacific' },
  { code: 'australia-southeast1', name: 'Australia Southeast (Sydney)', location: 'Asia Pacific' },
];

/** Common IANA timezones for daily usage scheduling. */
export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
] as const;

/** Organization admin portal API (super_admin via cloud-gateway). */
export const GCP_ORG_ADMIN_API_PREFIX = '/api/v1/cloud-automation-gcp/org-admin';

/** Client routes for the GCP services area. */
export const GCP_ROUTES = {
  dashboard: '/console/gcp',
  createRequest: '/console/gcp/requests/new',
  requests: '/console/gcp/requests',
  requestStatus: (id: string) => `/console/gcp/requests/${id}`,
  orgAdmin: '/super-admin-console/gcp/org-admin',
  consoleHub: '/console',
} as const;

export const GCP_SERVICE = {
  id: 'gcp',
  name: 'GCP Services',
  description: 'Google Cloud access management, provisioning, and lab environments.',
} as const;
