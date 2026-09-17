import {
  chargeAdminWalletForCloudRequest,
  getMyAdminWallet,
  linkAdminWalletCloudCharge,
  refundAdminWalletCloudCharge,
} from './adminBillingApi';
import { isTenantPortalClient } from './portalClient';
import {
  chargeTenantWalletForCloudRequest,
  getTenantWallet,
  linkTenantWalletCloudCharge,
  refundTenantWalletCloudCharge,
} from './tenantPortalApi';
import type { AdminCloudChargeResult, AdminWallet } from '../types/adminBilling';

/**
 * Load the wallet for the current portal (tenant wallet vs platform admin wallet).
 */
export async function getCloudRequestWallet(): Promise<AdminWallet> {
  if (isTenantPortalClient()) {
    const wallet = await getTenantWallet();
    return {
      balance: wallet.balance,
      currency: wallet.currency || 'INR',
      usdToInrRate: wallet.usdToInrRate,
    };
  }

  return getMyAdminWallet();
}

export async function chargeCloudRequestWallet(
  amountUsd: number,
  relatedRequestId: string | null | undefined,
  provider: 'azure' | 'aws' | 'gcp',
  attribution?: {
    projectId?: string | null;
    serviceKey?: 'azure' | 'aws' | 'gcp' | 'cloud-labs' | null;
  }
): Promise<AdminCloudChargeResult> {
  if (isTenantPortalClient()) {
    return chargeTenantWalletForCloudRequest(
      amountUsd,
      relatedRequestId,
      provider,
      attribution
    );
  }

  return chargeAdminWalletForCloudRequest(amountUsd, relatedRequestId, provider, attribution);
}

export async function refundCloudRequestWallet(
  amountInr: number,
  relatedRequestId?: string | null,
  provider: 'azure' | 'aws' | 'gcp' = 'azure'
): Promise<AdminWallet> {
  if (isTenantPortalClient()) {
    return refundTenantWalletCloudCharge(amountInr, relatedRequestId, provider);
  }

  return refundAdminWalletCloudCharge(amountInr, relatedRequestId);
}

export async function linkCloudRequestWalletCharge(
  relatedRequestId: string,
  provider: 'azure' | 'aws' | 'gcp' = 'azure'
): Promise<void> {
  if (isTenantPortalClient()) {
    await linkTenantWalletCloudCharge(relatedRequestId, provider);
    return;
  }

  await linkAdminWalletCloudCharge(relatedRequestId);
}
