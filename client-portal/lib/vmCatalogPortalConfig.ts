import {
  fetchCatalogVm,
  fetchVmCatalogOverview,
  fetchVmCatalogPlans,
  fetchVmCatalogSoftwareOptions,
  fetchVmCatalogVms,
  getCatalogVmConsole,
  submitCatalogVmRequest,
  submitSuperAdminCatalogVmRequest,
  type CatalogSoftwareOption,
  type CatalogVmConsoleSession,
  type CatalogVmOverview,
  type CreateCatalogVmRequestDto,
  type ICatalogVm,
  type IVmCatalogPlan,
} from './vmCatalogApi';
import {
  fetchTenantCatalogVm,
  fetchTenantVmCatalogOverview,
  fetchTenantVmCatalogPlans,
  fetchTenantVmCatalogSoftwareOptions,
  fetchTenantVmCatalogVms,
  getTenantCatalogVmConsole,
  submitTenantCatalogVmRequest,
} from './tenantVmCatalogApi';
import { TENANT_CONSOLE, tenantConsole } from './tenantAdminRoutes';

export interface VmCatalogPortalRoutes {
  overview: string;
  create: string;
  myVms: string;
  console: (id: string) => string;
  hub: string;
}

export interface VmCatalogPortalApi {
  fetchPlans: () => Promise<IVmCatalogPlan[]>;
  fetchOverview: () => Promise<CatalogVmOverview>;
  fetchVms: () => Promise<ICatalogVm[]>;
  fetchVm: (id: string) => Promise<ICatalogVm>;
  fetchSoftwareOptions: () => Promise<CatalogSoftwareOption[]>;
  submitRequest: (dto: CreateCatalogVmRequestDto) => Promise<ICatalogVm>;
  getConsole: (
    id: string,
    dimensions?: { width?: number; height?: number; instanceId?: string }
  ) => Promise<CatalogVmConsoleSession>;
}

export interface VmCatalogPortalConfig {
  routes: VmCatalogPortalRoutes;
  api: VmCatalogPortalApi;
}

const adminRoutes: VmCatalogPortalRoutes = {
  overview: '/console/create-vm',
  create: '/console/create-vm/create',
  myVms: '/console/create-vm/my-vms',
  console: (id) => `/console/create-vm/my-vms/${id}/console`,
  hub: '/console',
};

const tenantRoutes: VmCatalogPortalRoutes = {
  overview: tenantConsole.createVm,
  create: tenantConsole.createVmCreate,
  myVms: tenantConsole.createVmMyVms,
  console: tenantConsole.createVmConsole,
  hub: TENANT_CONSOLE,
};

const adminApi: VmCatalogPortalApi = {
  fetchPlans: fetchVmCatalogPlans,
  fetchOverview: fetchVmCatalogOverview,
  fetchVms: fetchVmCatalogVms,
  fetchVm: fetchCatalogVm,
  fetchSoftwareOptions: fetchVmCatalogSoftwareOptions,
  submitRequest: submitCatalogVmRequest,
  getConsole: getCatalogVmConsole,
};

const tenantApi: VmCatalogPortalApi = {
  fetchPlans: fetchTenantVmCatalogPlans,
  fetchOverview: fetchTenantVmCatalogOverview,
  fetchVms: fetchTenantVmCatalogVms,
  fetchVm: fetchTenantCatalogVm,
  fetchSoftwareOptions: fetchTenantVmCatalogSoftwareOptions,
  submitRequest: submitTenantCatalogVmRequest,
  getConsole: getTenantCatalogVmConsole,
};

export const adminVmCatalogPortalConfig: VmCatalogPortalConfig = {
  routes: adminRoutes,
  api: adminApi,
};

const superAdminRoutes: VmCatalogPortalRoutes = {
  overview: '/super-admin-console/create-vm',
  create: '/super-admin-console/create-vm/create',
  myVms: '/super-admin-console/create-vm/my-vms',
  console: (id) => `/super-admin-console/create-vm/my-vms/${id}/console`,
  hub: '/super-admin-console',
};

const superAdminApi: VmCatalogPortalApi = {
  fetchPlans: fetchVmCatalogPlans,
  fetchOverview: fetchVmCatalogOverview,
  fetchVms: fetchVmCatalogVms,
  fetchVm: fetchCatalogVm,
  fetchSoftwareOptions: fetchVmCatalogSoftwareOptions,
  submitRequest: submitSuperAdminCatalogVmRequest,
  getConsole: getCatalogVmConsole,
};

export const superAdminVmCatalogPortalConfig: VmCatalogPortalConfig = {
  routes: superAdminRoutes,
  api: superAdminApi,
};

export const tenantVmCatalogPortalConfig: VmCatalogPortalConfig = {
  routes: tenantRoutes,
  api: tenantApi,
};
