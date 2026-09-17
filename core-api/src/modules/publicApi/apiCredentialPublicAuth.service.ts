import mongoose from 'mongoose';
import { ApiCredentialModel, type IApiCredential } from '../../models/apiCredential.model';
import type { ApiAccessTokenPayload } from '../../utils/jwt';

/**
 * Validates that a stored credential still matches the signed api_access token
 * (owner binding). Status must already be enforced by the DB query.
 */
export function credentialMatchesApiAccessToken(
  credential: Pick<IApiCredential, 'ownerType' | 'tenantId' | 'adminId'>,
  payload: Pick<ApiAccessTokenPayload, 'ownerType' | 'tenantId' | 'adminId'>
): boolean {
  if (credential.ownerType !== payload.ownerType) {
    return false;
  }

  if (credential.ownerType === 'tenant') {
    const tokenTenant = payload.tenantId ?? null;
    const docTenant = credential.tenantId?.toString() ?? null;
    return Boolean(tokenTenant && docTenant && tokenTenant === docTenant);
  }

  const tokenAdmin = payload.adminId ?? null;
  const docAdmin = credential.adminId?.toString() ?? null;
  return Boolean(tokenAdmin && docAdmin && tokenAdmin === docAdmin);
}

/**
 * Load the ApiCredential on every public API request (no caching).
 * Revoked credentials are excluded by querying status === 'active' only.
 */
export async function loadActiveApiCredentialForToken(
  payload: ApiAccessTokenPayload
): Promise<IApiCredential | null> {
  const clientId = payload.sub.trim();
  if (!clientId) {
    return null;
  }

  const filter: Record<string, unknown> = {
    clientId,
    status: 'active',
  };

  if (payload.cid) {
    try {
      filter._id = new mongoose.Types.ObjectId(payload.cid);
    } catch {
      return null;
    }
  }

  const credential = await ApiCredentialModel.findOne(filter);
  if (!credential) {
    return null;
  }

  if (!credentialMatchesApiAccessToken(credential, payload)) {
    return null;
  }

  if (credential.ownerType === 'tenant') {
    if (!credential.tenantId) {
      return null;
    }
  } else if (credential.ownerType === 'platform') {
    if (!credential.adminId) {
      return null;
    }
  } else {
    return null;
  }

  return credential;
}
