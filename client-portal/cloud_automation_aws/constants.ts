export const AWS_API_BASE = '/api/v1/cloud-automation-aws';

export const AWS_DEFAULT_REGION = 'ap-south-1';

export const AWS_REGIONS = [
  { code: 'ap-south-1', name: 'Asia Pacific (Mumbai)', location: 'Asia Pacific' },
  { code: 'us-east-1', name: 'US East (N. Virginia)', location: 'US East' },
  { code: 'us-west-2', name: 'US West (Oregon)', location: 'US West' },
  { code: 'eu-west-1', name: 'Europe (Ireland)', location: 'Europe' },
  { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', location: 'Asia Pacific' },
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

/** Client routes for the AWS services area. */
export const AWS_ROUTES = {
  dashboard: '/console/aws',
  createRequest: '/console/aws/requests/new',
  requests: '/console/aws/requests',
  requestStatus: (id: string) => `/console/aws/requests/${id}`,
  consoleHub: '/console',
} as const;

export const AWS_SERVICE = {
  id: 'aws',
  name: 'AWS Services',
  description: 'AWS access management, provisioning, and lab environments.',
} as const;
