import type {
  DedicatedServerProtocol,
  DedicatedServerStatus,
} from '../../models/dedicatedServerRequest.model';

export interface DedicatedPlanResponse {
  _id: string;
  name: string;
  description?: string;
  cpu: string;
  ram: string;
  disk: string;
  location?: string;
  features: string[];
  monthlyPrice: number;
  setupFee: number | null;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DedicatedPricingSettings {
  sellMultiplier: number;
  updatedAt: string | null;
}

export interface DedicatedServerResponse {
  _id: string;
  adminId?: string;
  tenantId?: string;
  tenantUserId?: string;
  adminEmail?: string;
  planId: string;
  planName: string;
  specs: {
    cpu: string;
    ram: string;
    disk: string;
    location?: string;
  };
  monthlyPrice: number;
  setupFee?: number | null;
  subtotal?: number;
  tax?: number;
  currency: string;
  notes?: string;
  status: DedicatedServerStatus;
  chargedAmount?: number;
  walletDebited?: boolean;
  hostname?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  protocol?: DedicatedServerProtocol;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  attachedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DedicatedRequesterGroup {
  adminId: string;
  adminEmail: string;
  pendingCount: number;
  totalCount: number;
  lastRequestedAt: string | null;
}

export interface DedicatedConsoleSession {
  protocol: DedicatedServerProtocol;
  clientUrl: string;
  connectionId: string;
}
