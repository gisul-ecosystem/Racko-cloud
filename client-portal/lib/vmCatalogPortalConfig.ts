import {
  fetchCatalogVm,
  fetchVmCatalogOverview,
  fetchVmCatalogPlans,
  fetchVmCatalogVms,
  getCatalogVmConsole,
  submitCatalogVmRequest,
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
  submitRequest: (dto: CreateCatalogVmRequestDto) => Promise<ICatalogVm>;
  getConsole: (
    id: string,
    dimensions?: { width?: number; height?: number }
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
  submitRequest: submitCatalogVmRequest,
  getConsole: getCatalogVmConsole,
};

const tenantApi: VmCatalogPortalApi = {
  fetchPlans: fetchTenantVmCatalogPlans,
  fetchOverview: fetchTenantVmCatalogOverview,
  fetchVms: fetchTenantVmCatalogVms,
  fetchVm: fetchTenantCatalogVm,
  submitRequest: submitTenantCatalogVmRequest,
  getConsole: getTenantCatalogVmConsole,
};

export const adminVmCatalogPortalConfig: VmCatalogPortalConfig = {
  routes: adminRoutes,
  api: adminApi,
};

export const tenantVmCatalogPortalConfig: VmCatalogPortalConfig = {
  routes: tenantRoutes,
  api: tenantApi,
};
