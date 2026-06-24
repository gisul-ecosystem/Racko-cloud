export type TenantUserRole = 'tenant_admin' | 'tenant_user';

export interface TenantPortalUser {
  id: string;
  email: string;
  role: TenantUserRole;
  tenantId: string;
}

export interface TenantWallet {
  balance: number;
  currency: string;
}

export interface TenantWalletTransaction {
  id: string;
  type: string;
  amount: number;
  reason: string;
  relatedOrderId: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface TenantWalletTransactionsResult {
  transactions: TenantWalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface TenantTopupResult {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface TenantOrderTemplate {
  templateId: number;
  name: string;
  node: string;
  baselineSpecs: {
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
  };
  pricePerVm: number;
}

export type TenantOrderStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'fulfilled';

export interface TenantOrder {
  id: string;
  tenantId: string;
  templateId: number;
  templateName: string;
  count: number;
  specs: {
    cpuCores: number;
    memoryGb: number;
    diskGb: number;
  };
  calculatedAmount: number;
  status: TenantOrderStatus;
  createdBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}
