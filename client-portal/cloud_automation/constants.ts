/** Gateway prefix for cloud_automation admin APIs (Type 1). */
export const CLOUD_AUTOMATION_API_PREFIX = '/api/v1/cloud-automation';

/** Public manage-users portal API (token/session auth on cloud_automation). */
export const MANAGE_PORTAL_API_PREFIX = '/api/manage';

/** Organization admin portal API (session auth on cloud_automation). */
export const ORG_ADMIN_API_PREFIX = '/api/org-admin';

/** Client routes for the Azure services area. */
export const AZURE_ROUTES = {
  dashboard: '/console/azure',
  createRequest: '/console/azure/requests/new',
  requestStatus: (id: number | string) => `/console/azure/requests/${id}`,
  /** Short alias used by the standalone request builder flow. */
  legacyCreateRequest: '/request',
  legacyRequestStatus: (id: number | string) => `/status/${id}`,
  orgAdmin: '/console/azure/org-admin',
  manageUsers: '/manage-users',
  consoleHub: '/console',
} as const;

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

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const WEEKDAY_INITIALS: Record<(typeof WEEKDAYS)[number], string> = {
  monday: 'M',
  tuesday: 'T',
  wednesday: 'W',
  thursday: 'T',
  friday: 'F',
  saturday: 'S',
  sunday: 'S',
};

export const AZURE_SERVICE = {
  id: 'azure',
  name: 'Azure Services',
  description: 'Azure access management, provisioning, and lab environments.',
} as const;
