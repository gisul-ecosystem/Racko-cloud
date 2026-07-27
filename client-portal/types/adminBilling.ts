export interface AdminTemplateRates {
  cpuRatePerCoreMonthly: number;
  ramRatePerGbMonthly: number;
  diskRatePerGbMonthly: number;
  billingDiscounts: {
    quarterly: number;   // 0–1
    yearly: number;      // 0–1
  };
}

export interface AdminPricingConfig {
  templatePricing: Record<string, AdminTemplateRates>;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AdminWallet {
  balance: number;
  currency: string;
  /** Present when returned from wallet/me — used to convert Azure USD estimates to INR. */
  usdToInrRate?: number;
}

export interface AdminCloudChargeResult {
  balance: number;
  currency: string;
  chargedInr: number;
  amountUsd: number;
  usdToInrRate: number;
}

export interface AdminWalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  relatedVmJobId: string | null;
  creditedBy: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface AdminWalletTransactionsResult {
  transactions: AdminWalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminVmQuote {
  templateId?: number;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  cpuCost: number;
  ramCost: number;
  diskCost: number;
  subtotal: number;
  discountPct: number;
  total: number;
  count: number;
  grandTotal: number;
}

export interface AdminQuoteInput {
  templateId: number;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  count?: number;
  billingPeriod?: 'monthly' | 'quarterly' | 'yearly';
}
