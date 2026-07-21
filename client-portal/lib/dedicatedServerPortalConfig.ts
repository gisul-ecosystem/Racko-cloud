import {
  fetchDedicatedPlans,
  fetchDedicatedServer,
  fetchMyDedicatedServers,
  getDedicatedServerConsole,
  submitDedicatedServerRequest,
  type DedicatedConsoleSession,
  type IDedicatedPlan,
  type IDedicatedServer,
} from './dedicatedServerApi';
import {
  fetchTenantDedicatedPlans,
  fetchTenantDedicatedServer,
  fetchTenantDedicatedServers,
  getTenantDedicatedServerConsole,
  submitTenantDedicatedServerRequest,
} from './tenantDedicatedServerApi';
import { TENANT_CONSOLE, tenantConsole } from './tenantAdminRoutes';

export interface DedicatedServerPortalRoutes {
  overview: string;
  request: string;
  myServers: string;
  console: (id: string) => string;
  hub: string;
}

export interface DedicatedServerPortalApi {
  fetchPlans: () => Promise<IDedicatedPlan[]>;
  fetchServers: () => Promise<IDedicatedServer[]>;
  fetchServer: (id: string) => Promise<IDedicatedServer>;
  submitRequest: (opts: { planId: string; notes?: string }) => Promise<IDedicatedServer>;
  getConsole: (
    id: string,
    dimensions?: { width?: number; height?: number }
  ) => Promise<DedicatedConsoleSession>;
}

export interface DedicatedServerPortalConfig {
  routes: DedicatedServerPortalRoutes;
  api: DedicatedServerPortalApi;
}

const adminRoutes: DedicatedServerPortalRoutes = {
  overview: '/console/dedicated-server',
  request: '/console/dedicated-server/request',
  myServers: '/console/dedicated-server/my-servers',
  console: (id) => `/console/dedicated-server/my-servers/${id}/console`,
  hub: '/console',
};

const tenantRoutes: DedicatedServerPortalRoutes = {
  overview: tenantConsole.dedicatedServer,
  request: tenantConsole.dedicatedServerRequest,
  myServers: tenantConsole.dedicatedServerMyServers,
  console: tenantConsole.dedicatedServerConsole,
  hub: TENANT_CONSOLE,
};

const adminApi: DedicatedServerPortalApi = {
  fetchPlans: fetchDedicatedPlans,
  fetchServers: fetchMyDedicatedServers,
  fetchServer: fetchDedicatedServer,
  submitRequest: submitDedicatedServerRequest,
  getConsole: getDedicatedServerConsole,
};

const tenantApi: DedicatedServerPortalApi = {
  fetchPlans: fetchTenantDedicatedPlans,
  fetchServers: fetchTenantDedicatedServers,
  fetchServer: fetchTenantDedicatedServer,
  submitRequest: submitTenantDedicatedServerRequest,
  getConsole: getTenantDedicatedServerConsole,
};

export const adminDedicatedServerPortalConfig: DedicatedServerPortalConfig = {
  routes: adminRoutes,
  api: adminApi,
};

export const tenantDedicatedServerPortalConfig: DedicatedServerPortalConfig = {
  routes: tenantRoutes,
  api: tenantApi,
};
