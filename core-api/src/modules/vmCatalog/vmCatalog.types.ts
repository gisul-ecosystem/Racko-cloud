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
  /** Organization/tenant project this purchase belongs to. */
  projectId?: string;
  projectName?: string;
  clientName?: string;
  /** Omitted for admin-role callers (provider leak guard). */
  provider?: VmCatalogProvider;
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
  needsOsChange?: boolean;
  osTemplateChanged?: boolean;
  osTemplateChangedAt?: string;
  attachedAt?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** Super-admin only */
  region?: string;
  /** Super-admin only */
  providerInstanceId?: string;
  expiresAt?: string;
  autoProvisioned?: boolean;
  /** Super-admin only */
  rawProviderCostPerHr?: number;
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
  /** Optional; inferred from billing when omitted. */
  durationDays?: number;
  canonicalSpec?: string;
  /** Required for platform admin purchases. */
  projectId?: string;
}

export interface CatalogVmRequesterGroup {
  adminId: string;
  adminEmail: string;
  pendingCount: number;
  totalCount: number;
  lastRequestedAt: string | null;
}
