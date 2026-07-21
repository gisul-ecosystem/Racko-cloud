import type {
  VmCatalogCategory,
  VmCatalogProvider,
  VmCatalogStatus,
  VmCatalogSpecs,
  VmCatalogTemplate,
  VmCatalogPricingSnapshot,
  VmCatalogProtocol,
} from '../../models/catalogVm.model';

export interface CatalogVmResponse {
  _id: string;
  adminId?: string;
  tenantId?: string;
  tenantUserId?: string;
  adminEmail?: string;
  provider: VmCatalogProvider;
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs: VmCatalogSpecs;
  billing: string;
  quantity: number;
  template: VmCatalogTemplate;
  pricingSnapshot: VmCatalogPricingSnapshot;
  status: VmCatalogStatus;
  /** Admin-facing status (ready_to_attach stays provisioning until Attach). */
  displayStatus?: VmCatalogStatus;
  chargedAmount?: number;
  walletDebited?: boolean;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  protocol?: VmCatalogProtocol;
  externalRef?: string;
  fulfillError?: string;
  providerPurchased?: boolean;
  attachedAt?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
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
  recent: CatalogVmResponse[];
}

export interface CreateCatalogVmRequestDto {
  category: VmCatalogCategory;
  planId: string;
  planName: string;
  specs?: VmCatalogSpecs;
  billing: string;
  quantity: number;
  template: VmCatalogTemplate;
  pricingSnapshot: VmCatalogPricingSnapshot;
}

export interface CatalogVmRequesterGroup {
  adminId: string;
  adminEmail: string;
  pendingCount: number;
  totalCount: number;
  lastRequestedAt: string | null;
}
