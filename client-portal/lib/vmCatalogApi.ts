import { apiRequest } from './apiClient';
import { directGatewayRequest } from './directGatewayRequest';

const SUPER_ADMIN_AZURE_CATALOG_PREFIX = '/api/v1/vm-catalog/super-admin/azure/';

/** Bypass Next.js dev rewrites — slow Azure ARM calls hit socket hang-up otherwise. */
function shouldBypassNextProxyForAzureCatalog(path: string, method?: string): boolean {
  if (!path.startsWith(SUPER_ADMIN_AZURE_CATALOG_PREFIX)) return false;
  const httpMethod = (method || 'GET').toUpperCase();
  if (path.includes('/placement-options')) return httpMethod === 'POST';
  if (path.includes('/create')) return httpMethod === 'POST';
  if (path.includes('/power')) return httpMethod === 'POST';
  if (path.includes('/marketplace/images')) return httpMethod === 'GET';
  if (path.includes('/validate-image')) return httpMethod === 'POST';
  if (path.includes('/custom-images')) return httpMethod === 'GET';
  return false;
}

/** Azure start/stop/deallocate can take 30–90s — bypass Next.js dev proxy. */
async function catalogVmPowerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (typeof window !== 'undefined') {
    return directGatewayRequest<T>(path, options);
  }
  return apiRequest<T>(path, options);
}

async function vmCatalogApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (typeof window !== 'undefined' && shouldBypassNextProxyForAzureCatalog(path, options.method)) {
    return directGatewayRequest<T>(path, options);
  }
  return apiRequest<T>(path, options);
}

export type VmCatalogCategory =
  | 'ubuntu'
  | 'rocky'
  | 'debian'
  | 'windows'
  | 'linux'
  | 'gpu';

/** Sell-price / multiplier bucket for a catalog OS choice. */
export function catalogPricingBucket(
  category: VmCatalogCategory | string
): 'linux' | 'windows' | 'gpu' {
  const c = String(category || '').toLowerCase();
  if (c === 'windows') return 'windows';
  if (c === 'gpu') return 'gpu';
  return 'linux';
}
export type VmCatalogStatus =
  | 'pending_approval'
  | 'approved'
  | 'provisioning'
  | 'fulfilling'
  | 'ready_to_attach'
  | 'active'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'suspended'
  | 'terminated';

export interface ICatalogVm {
  _id: string;
  parentRequestId?: string;
  instanceId?: string;
  instanceIndex?: number;
  instanceTotal?: number;
  adminId?: string;
  tenantId?: string;
  tenantUserId?: string;
  adminEmail?: string;
  powerControlMode?: 'webyne' | 'azure';
  provider: 'webyne' | 'aws' | 'azure' | 'gcp' | 'oci';
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs: {
    cpu?: string;
    ram?: string;
    disk?: string;
  };
  billing: string;
  quantity: number;
  template: {
    value: string;
    label: string;
  };
  pricingSnapshot: {
    currency: string;
    subtotal?: number;
    tax?: number;
    total: number;
    billingLabel?: string;
  };
  status: VmCatalogStatus;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  protocol?: 'ssh' | 'rdp';
  externalRef?: string;
  fulfillError?: string;
  providerPurchased?: boolean;
  needsOsChange?: boolean;
  osTemplateChanged?: boolean;
  osTemplateChangedAt?: string;
  region?: string;
  providerInstanceId?: string;
  azureResourceGroup?: string;
  attachedAt?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** Organization/tenant project this purchase belongs to. */
  projectId?: string;
  projectName?: string;
  clientName?: string;
  preferredSoftwareIds?: string[];
  machineId?: string;
  postReadyStatus?: 'none' | 'pending' | 'running' | 'done' | 'failed';
  postReadyError?: string;
  postReadyJobTotal?: number;
  postReadyJobDone?: number;
  postReadyJobFailed?: number;
  postReadyJobRunning?: number;
  postReadyJobPending?: number;
  postReadyStage?:
    | 'not_requested'
    | 'agent_pushing'
    | 'agent_waiting_online'
    | 'agent_online'
    | 'software_queued'
    | 'software_installing'
    | 'software_done'
    | 'failed';
  postReadyStageLabel?: string;
  postReadyMachineStatus?: 'pending' | 'online' | 'offline';
  postReadyAgentConnected?: boolean;
  postReadyRunningSoftware?: string[];
  postReadyPendingSoftware?: string[];
  fetchedCount?: number;
  missingCount?: number;
  partial?: boolean;
  instances?: Array<{
    instanceId: string;
    instanceIndex: number;
    status: 'ready_to_attach' | 'active';
    hostname?: string;
    ipAddress?: string;
    username?: string;
    password?: string;
    protocol?: 'ssh' | 'rdp';
    externalRef?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVmOverviewStats {
  total: number;
  active: number;
  pending: number;
  linux: number;
  windows: number;
  gpu: number;
}

export interface CatalogVmOverview {
  stats: CatalogVmOverviewStats;
  recent: ICatalogVm[];
}

export interface CatalogVmRequesterGroup {
  adminId: string;
  adminEmail: string;
  pendingCount: number;
  totalCount: number;
  lastRequestedAt: string | null;
}

export interface CreateCatalogVmRequestDto {
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs?: {
    cpu?: string;
    ram?: string;
    disk?: string;
  };
  billing: string;
  quantity: number;
  template: {
    value: string;
    label: string;
  };
  pricingSnapshot: {
    currency: string;
    subtotal?: number;
    tax?: number;
    total: number;
    billingLabel?: string;
  };
  /** Required for platform admin purchases. */
  projectId?: string;
  /** Optional Software Catalog package IDs to install after the VM is ready. */
  preferredSoftwareIds?: string[];
}

export interface IVmCatalogPlan {
  _id: string;
  sno?: number;
  name: string;
  /** Present on admin/tenant plan lists when `name` is the Cloud VPS display label. */
  providerName?: string;
  vcpu: number;
  ramGb: number;
  ssdGb: number;
  hourly: number | null;
  monthly: number | null;
  quarterly: number | null;
  yearly: number | null;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  sellPricesByCategory?: Record<
    'linux' | 'windows' | 'gpu',
    {
      hourly: number | null;
      monthly: number | null;
      quarterly: number | null;
      yearly: number | null;
    }
  >;
  /** From plan list when sell pricing is applied — whether hourly is offered. */
  hourlyEnabled?: boolean;
}

export type CreateVmCatalogPlanDto = {
  sno?: number;
  name: string;
  vcpu: number;
  ramGb: number;
  ssdGb: number;
  hourly?: number | null;
  monthly?: number | null;
  quarterly?: number | null;
  yearly?: number | null;
  currency?: string;
  isActive?: boolean;
  sortOrder?: number;
};

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchVmCatalogPlans(): Promise<IVmCatalogPlan[]> {
  const res = await apiRequest<ApiResponse<{ plans: IVmCatalogPlan[]; total: number }>>(
    '/api/v1/vm-catalog/plans'
  );
  return res.data.plans;
}

export async function createVmCatalogPlan(
  body: CreateVmCatalogPlanDto
): Promise<IVmCatalogPlan> {
  const res = await apiRequest<ApiResponse<{ plan: IVmCatalogPlan }>>(
    '/api/v1/vm-catalog/plans',
    { method: 'POST', body: JSON.stringify(body) }
  );
  return res.data.plan;
}

export async function updateVmCatalogPlan(
  id: string,
  body: Partial<CreateVmCatalogPlanDto>
): Promise<IVmCatalogPlan> {
  const res = await apiRequest<ApiResponse<{ plan: IVmCatalogPlan }>>(
    `/api/v1/vm-catalog/plans/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  return res.data.plan;
}

export async function deleteVmCatalogPlan(id: string): Promise<void> {
  await apiRequest(`/api/v1/vm-catalog/plans/${id}`, { method: 'DELETE' });
}

export async function seedVmCatalogPlans(): Promise<{ inserted: number; total: number }> {
  const res = await apiRequest<ApiResponse<{ inserted: number; total: number }>>(
    '/api/v1/vm-catalog/plans/seed',
    { method: 'POST' }
  );
  return res.data;
}

export async function fetchVmCatalogOverview(): Promise<CatalogVmOverview> {
  const res = await apiRequest<ApiResponse<CatalogVmOverview>>('/api/v1/vm-catalog/overview');
  return res.data;
}

export interface CatalogSoftwareOption {
  _id: string;
  name: string;
  version: string;
  iconUrl?: string;
  supportedOS: Array<'windows' | 'linux' | 'macos'>;
  installMethod: string;
}

export async function fetchVmCatalogSoftwareOptions(): Promise<CatalogSoftwareOption[]> {
  const res = await apiRequest<
    ApiResponse<{ catalog: CatalogSoftwareOption[]; total: number }>
  >('/api/v1/vm-catalog/software-options');
  return res.data.catalog;
}

export async function fetchVmCatalogVms(): Promise<ICatalogVm[]> {
  const res = await apiRequest<ApiResponse<{ vms: ICatalogVm[]; total: number }>>(
    '/api/v1/vm-catalog/vms'
  );
  return res.data.vms;
}

export async function submitCatalogVmRequest(
  dto: CreateCatalogVmRequestDto
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    '/api/v1/vm-catalog/requests',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export async function submitSuperAdminCatalogVmRequest(
  dto: CreateCatalogVmRequestDto
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    '/api/v1/vm-catalog/super-admin/requests',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export interface RegisterManualAzureCatalogVmDto {
  resourceGroup: string;
  vmName: string;
  region: string;
  ipAddress: string;
  hostname?: string;
  username: string;
  password: string;
  protocol: 'rdp' | 'ssh';
  osCategory: string;
  catalogTemplate: string;
  billing?: string;
  subscriptionId?: string;
  attachNow?: boolean;
  ownerType?: 'admin' | 'tenant';
  ownerId?: string;
}

export async function registerManualAzureCatalogVm(
  dto: RegisterManualAzureCatalogVmDto
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    '/api/v1/vm-catalog/super-admin/azure/manual',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export async function fetchReadyManualAzureCatalogVms(): Promise<ICatalogVm[]> {
  const res = await apiRequest<ApiResponse<{ vms: ICatalogVm[]; total: number }>>(
    '/api/v1/vm-catalog/super-admin/azure/ready'
  );
  return res.data.vms;
}

export async function fetchSuperAdminAzureCatalogVms(): Promise<ICatalogVm[]> {
  const res = await apiRequest<ApiResponse<{ vms: ICatalogVm[]; total: number }>>(
    '/api/v1/vm-catalog/super-admin/azure/vms'
  );
  return res.data.vms;
}

export async function superAdminAzureCatalogVmPowerAction(
  id: string,
  action: CatalogVmPowerAction,
  instanceId?: string
): Promise<{ action: CatalogVmPowerAction; panelUrl?: string; request: ICatalogVm }> {
  const res = await catalogVmPowerRequest<
    ApiResponse<{ action: CatalogVmPowerAction; panelUrl?: string; request: ICatalogVm }>
  >(`/api/v1/vm-catalog/super-admin/azure/${id}/power`, {
    method: 'POST',
    body: JSON.stringify({ action, ...(instanceId ? { instanceId } : {}) }),
  });
  return res.data;
}

export async function attachManualAzureCatalogVm(
  id: string,
  dto: { ownerType: 'admin' | 'tenant'; ownerId: string }
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/super-admin/azure/${id}/attach`,
    {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export interface AzureProvisionReadyStatus {
  ready: boolean;
  message?: string | null;
  defaultLocation?: string | null;
  homeLocation?: string | null;
  catalogBrowseRegion?: string | null;
  subscriptionId?: string | null;
  networkResourceGroup?: string | null;
  vnetName?: string | null;
  subnetName?: string | null;
}

export async function fetchAzureProvisionReady(): Promise<AzureProvisionReadyStatus> {
  const res = await apiRequest<ApiResponse<AzureProvisionReadyStatus>>(
    '/api/v1/vm-catalog/super-admin/azure/provision-ready'
  );
  return res.data;
}

export interface AzureVmImageOption {
  publisher: string;
  offer: string;
  sku: string;
  label: string;
}

export interface AzureLocationOption {
  name: string;
  displayName: string;
  regionalDisplayName: string;
}

export interface AzureMarketplaceImagePlan {
  planId?: string;
  displayName?: string;
  publisher?: string;
  offer?: string;
  sku?: string;
  summary?: string | null;
  version?: string | null;
  versionLabel?: string | null;
}

export interface AzureMarketplaceImageCard {
  id: string;
  displayName: string;
  publisher?: string;
  publisherId?: string;
  offer?: string | null;
  sku?: string | null;
  summary?: string;
  iconUrl?: string | null;
  operatingSystems?: string[];
  productType?: string;
  plans: AzureMarketplaceImagePlan[];
  source?: string;
}

export interface AzureMarketplaceSearchResult {
  rows: AzureMarketplaceImageCard[];
  total: number;
  skip: number;
  take: number;
  source?: string;
}

export async function fetchAzureLocations(): Promise<AzureLocationOption[]> {
  const res = await apiRequest<ApiResponse<{ rows: AzureLocationOption[] }>>(
    '/api/v1/vm-catalog/super-admin/azure/locations'
  );
  return res.data.rows;
}

export async function searchAzureMarketplaceImages(input: {
  query?: string;
  osType?: 'linux' | 'windows';
  skip?: number;
  take?: number;
}): Promise<AzureMarketplaceSearchResult> {
  const qs = new URLSearchParams();
  if (input.query?.trim()) qs.set('q', input.query.trim());
  if (input.osType) qs.set('osType', input.osType);
  if (input.skip != null) qs.set('skip', String(input.skip));
  if (input.take != null) qs.set('take', String(input.take));
  const res = await vmCatalogApiRequest<ApiResponse<AzureMarketplaceSearchResult>>(
    `/api/v1/vm-catalog/super-admin/azure/marketplace/images?${qs.toString()}`
  );
  return res.data;
}

export async function fetchAzureImageSkuPlans(input: {
  region: string;
  publisher: string;
  offer: string;
  productDisplayName?: string;
}): Promise<AzureMarketplaceImagePlan[]> {
  const qs = new URLSearchParams();
  qs.set('region', input.region.trim());
  qs.set('publisher', input.publisher.trim());
  qs.set('offer', input.offer.trim());
  if (input.productDisplayName?.trim()) {
    qs.set('productDisplayName', input.productDisplayName.trim());
  }
  const res = await apiRequest<ApiResponse<{ rows: AzureMarketplaceImagePlan[] }>>(
    `/api/v1/vm-catalog/super-admin/azure/marketplace/image-plans?${qs.toString()}`
  );
  return res.data.rows;
}

export interface AzureVmImageValidation {
  valid: boolean;
  message?: string;
  publisher?: string;
  offer?: string;
  sku?: string;
  version?: string;
  label?: string;
  region?: string;
  availableRegions?: string[];
}

export async function validateAzureVmImage(input: {
  publisher: string;
  offer: string;
  sku: string;
  region?: string;
  version?: string;
}): Promise<AzureVmImageValidation> {
  const res = await vmCatalogApiRequest<ApiResponse<AzureVmImageValidation>>(
    '/api/v1/vm-catalog/super-admin/azure/validate-image',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

export interface AzureCustomImageOption {
  id: string;
  name: string;
  resourceGroup?: string | null;
  location?: string;
  osType: string;
  label: string;
  source: 'managed' | 'gallery';
  version?: string;
}

export interface AzureCustomImageValidation {
  valid: boolean;
  message?: string;
  id?: string;
  label?: string;
  osType?: string;
  location?: string;
  source?: string;
}

export async function searchAzureCustomImages(
  query = '',
  limit = 50,
  resourceGroup?: string
): Promise<AzureCustomImageOption[]> {
  const qs = new URLSearchParams();
  if (query.trim()) qs.set('q', query.trim());
  if (limit) qs.set('limit', String(limit));
  if (resourceGroup?.trim()) qs.set('resourceGroup', resourceGroup.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await vmCatalogApiRequest<ApiResponse<{ rows: AzureCustomImageOption[] }>>(
    `/api/v1/vm-catalog/super-admin/azure/custom-images${suffix}`
  );
  return res.data.rows;
}

export async function validateAzureCustomImage(input: {
  imageId: string;
  region?: string;
}): Promise<AzureCustomImageValidation> {
  const res = await apiRequest<ApiResponse<AzureCustomImageValidation>>(
    '/api/v1/vm-catalog/super-admin/azure/validate-custom-image',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return res.data;
}

export interface AzurePlacementOption {
  region: string;
  vmSize: string;
  vcpu: number;
  memoryGb: number;
  estimatedHourlyUsd: number;
  estimatedComputeHourlyUsd?: number;
  estimatedStorageHourlyUsd?: number;
  estimatedIpHourlyUsd?: number;
}

export interface AzurePlacementOptionsResult {
  options: AzurePlacementOption[];
  total: number;
  canonicalSpec: string;
  message?: string;
  homeRegion?: string;
  regionMode?: 'home' | 'auto';
  assignPublicIp?: boolean;
  recommended?: AzurePlacementOption | null;
}

export interface QuoteAzurePlacementOptionsDto {
  category: string;
  vcpu: number;
  ramGb: number;
  ssdGb: number;
  region?: string;
  nestedVirtualization?: boolean;
  assignPublicIp?: boolean;
  imagePublisher?: string;
  imageOffer?: string;
  imageSku?: string;
}

export async function fetchAzurePlacementOptions(
  dto: QuoteAzurePlacementOptionsDto
): Promise<AzurePlacementOptionsResult> {
  const res = await vmCatalogApiRequest<ApiResponse<AzurePlacementOptionsResult>>(
    '/api/v1/vm-catalog/super-admin/azure/placement-options',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data;
}

export interface CreateAzureCatalogVmDto {
  ownerType: 'admin' | 'tenant';
  ownerId: string;
  projectId: string;
  category: string;
  catalogTemplate: string;
  osCategory?: string;
  canonicalSpec?: string;
  vcpu?: number;
  ramGb?: number;
  ssdGb?: number;
  nestedVirtualization?: boolean;
  region?: string;
  billing?: string;
  attachNow?: boolean;
  vmSize?: string;
  imagePublisher?: string;
  imageOffer?: string;
  imageSku?: string;
  imageVersion?: string;
  customImageId?: string;
  assignPublicIp?: boolean;
}

export async function createAzureCatalogVm(dto: CreateAzureCatalogVmDto): Promise<ICatalogVm> {
  const res = await vmCatalogApiRequest<ApiResponse<{ request: ICatalogVm }>>(
    '/api/v1/vm-catalog/super-admin/azure/create',
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
  return res.data.request;
}

export async function fetchCatalogVmRequesters(): Promise<CatalogVmRequesterGroup[]> {
  const res = await apiRequest<
    ApiResponse<{ requesters: CatalogVmRequesterGroup[]; total: number }>
  >('/api/v1/vm-catalog/requests/requesters');
  return res.data.requesters;
}

export async function fetchCatalogVmRequests(opts?: {
  status?: VmCatalogStatus | 'all';
  adminId?: string;
}): Promise<ICatalogVm[]> {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.adminId) qs.set('adminId', opts.adminId);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await apiRequest<ApiResponse<{ requests: ICatalogVm[]; total: number }>>(
    `/api/v1/vm-catalog/requests${suffix}`
  );
  return res.data.requests;
}

export async function fetchCatalogVm(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ vm: ICatalogVm }>>(
    `/api/v1/vm-catalog/vms/${id}`
  );
  return res.data.vm;
}

export interface CatalogVmConsoleSession {
  protocol: 'rdp' | 'ssh';
  clientUrl: string;
  connectionId: string;
}

export async function getCatalogVmConsole(
  id: string,
  dimensions?: { width?: number; height?: number; instanceId?: string }
): Promise<CatalogVmConsoleSession> {
  const params = new URLSearchParams();
  if (dimensions?.width) params.set('width', String(Math.round(dimensions.width)));
  if (dimensions?.height) params.set('height', String(Math.round(dimensions.height)));
  if (dimensions?.instanceId) params.set('instanceId', dimensions.instanceId);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await apiRequest<ApiResponse<CatalogVmConsoleSession>>(
    `/api/v1/vm-catalog/vms/${id}/console${qs}`
  );
  return res.data;
}

export async function approveCatalogVmRequest(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/approve`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function fetchCatalogVmDetails(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/fetch-details`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function attachCatalogVmRequest(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/attach`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function retryCatalogVmInstall(id: string): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/retry-install`,
    { method: 'PATCH' }
  );
  return res.data.request;
}

export async function changeCatalogVmTemplateToWindows(
  id: string,
  opts?: { template?: string }
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/change-template`,
    {
      method: 'PATCH',
      body: JSON.stringify(opts?.template ? { template: opts.template } : {}),
    }
  );
  return res.data.request;
}

export type CatalogVmPowerAction = 'virtualizor' | 'start' | 'stop' | 'reboot' | 'terminate';

export async function catalogVmPowerAction(
  id: string,
  action: CatalogVmPowerAction,
  instanceId?: string
): Promise<{ action: CatalogVmPowerAction; panelUrl?: string; request: ICatalogVm }> {
  const res = await catalogVmPowerRequest<
    ApiResponse<{ action: CatalogVmPowerAction; panelUrl?: string; request: ICatalogVm }>
  >(`/api/v1/vm-catalog/requests/${id}/power`, {
    method: 'POST',
    body: JSON.stringify({ action, ...(instanceId ? { instanceId } : {}) }),
  });
  return res.data;
}

export async function ownedCatalogVmPowerAction(
  id: string,
  action: CatalogVmPowerAction,
  instanceId?: string
): Promise<{ action: CatalogVmPowerAction; panelUrl?: string; vm: ICatalogVm }> {
  const res = await catalogVmPowerRequest<
    ApiResponse<{ action: CatalogVmPowerAction; panelUrl?: string; vm: ICatalogVm }>
  >(`/api/v1/vm-catalog/vms/${id}/power`, {
    method: 'POST',
    body: JSON.stringify({ action, ...(instanceId ? { instanceId } : {}) }),
  });
  return res.data;
}

export async function rejectCatalogVmRequest(
  id: string,
  reason: string
): Promise<ICatalogVm> {
  const res = await apiRequest<ApiResponse<{ request: ICatalogVm }>>(
    `/api/v1/vm-catalog/requests/${id}/reject`,
    {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }
  );
  return res.data.request;
}

export function formatCatalogVmStatus(status: VmCatalogStatus): string {
  const labels: Record<VmCatalogStatus, string> = {
    pending_approval: 'Pending approval',
    approved: 'Approved',
    provisioning: 'Provisioning',
    fulfilling: 'Provisioning…',
    ready_to_attach: 'Ready to attach',
    active: 'Active',
    failed: 'Fulfillment failed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
    terminated: 'Terminated',
  };
  return labels[status] ?? status;
}

export function catalogVmStatusNote(status: VmCatalogStatus): string | null {
  if (status === 'provisioning' || status === 'fulfilling') {
    return 'It will be available soon';
  }
  if (status === 'ready_to_attach') {
    return 'Ready for delivery';
  }
  return null;
}

export function catalogVmStatusTone(
  status: VmCatalogStatus
): 'gray' | 'amber' | 'blue' | 'green' | 'red' {
  switch (status) {
    case 'active':
      return 'green';
    case 'pending_approval':
    case 'ready_to_attach':
      return 'amber';
    case 'approved':
    case 'provisioning':
    case 'fulfilling':
      return 'blue';
    case 'rejected':
    case 'cancelled':
    case 'suspended':
    case 'failed':
    case 'terminated':
      return 'red';
    default:
      return 'gray';
  }
}
