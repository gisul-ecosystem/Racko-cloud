/** Mirrored admin paths under /tenant */
export const TENANT_CONSOLE = '/tenant/console';
export const TENANT_VPS = '/tenant/dashboard/admin';

export const tenantVps = {
  overview: TENANT_VPS,
  vms: `${TENANT_VPS}/vms`,
  createVm: `${TENANT_VPS}/vms/create`,
  vm: (id: string) => `${TENANT_VPS}/vms/${id}`,
  restricted: `${TENANT_VPS}/vms/restricted`,
  jobs: `${TENANT_VPS}/jobs`,
  job: (id: string) => `${TENANT_VPS}/jobs/${id}`,
  automation: `${TENANT_VPS}/automation`,
  templates: `${TENANT_VPS}/templates`,
  users: `${TENANT_VPS}/users`,
  usersCreate: `${TENANT_VPS}/users/create`,
  assignVms: `${TENANT_VPS}/assign-vms`,
  bulkAssign: `${TENANT_VPS}/assign-vms/bulk`,
  billing: `${TENANT_VPS}/billing`,
} as const;

export const tenantConsole = {
  hub: TENANT_CONSOLE,
  elastic: `${TENANT_CONSOLE}/elastic-servers`,
  elasticOverview: `${TENANT_CONSOLE}/elastic-servers/overview`,
  elasticAdd: `${TENANT_CONSOLE}/elastic-servers/add`,
  elasticBulk: `${TENANT_CONSOLE}/elastic-servers/bulk`,
  elasticConsole: (id: string) => `${TENANT_CONSOLE}/elastic-servers/${id}/console`,
  machineManager: `${TENANT_CONSOLE}/machine-manager`,
  machineSetup: `${TENANT_CONSOLE}/machine-manager/setup`,
  machineMachines: `${TENANT_CONSOLE}/machine-manager/machines`,
  machineJobs: `${TENANT_CONSOLE}/machine-manager/jobs`,
  azure: `${TENANT_CONSOLE}/azure`,
  azureNew: `${TENANT_CONSOLE}/azure/requests/new`,
  aws: `${TENANT_CONSOLE}/aws`,
  awsRequests: `${TENANT_CONSOLE}/aws/requests`,
  awsNew: `${TENANT_CONSOLE}/aws/requests/new`,
  gcp: `${TENANT_CONSOLE}/gcp`,
  docs: `${TENANT_CONSOLE}/docs`,
} as const;
