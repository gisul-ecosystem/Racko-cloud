import { decrypt, encrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';

const TAX_ID_ENCRYPTION_PREFIX = 'enc:v1:';

type OrganizationRecord = Record<string, unknown> & {
  orgId?: unknown;
  userId?: unknown;
  taxId?: string;
  toObject?: () => Record<string, unknown>;
};

type OrganizationRequestLike = {
  orgId?: unknown;
  userId?: unknown;
  taxId?: string;
  toObject?: () => Record<string, unknown>;
};

function resolveReadableOrgId(orgId: unknown): string | undefined {
  if (typeof orgId === 'string' && orgId.trim()) return orgId;
  return undefined;
}

export function encryptTaxId(taxId: string): string {
  const normalized = taxId.trim();
  if (!normalized || normalized.startsWith(TAX_ID_ENCRYPTION_PREFIX)) return normalized;
  return `${TAX_ID_ENCRYPTION_PREFIX}${encrypt(normalized)}`;
}

export function decryptTaxId(taxId: string | undefined): string | undefined {
  if (!taxId) return taxId;
  if (!taxId.startsWith(TAX_ID_ENCRYPTION_PREFIX)) return taxId;

  try {
    return decrypt(taxId.slice(TAX_ID_ENCRYPTION_PREFIX.length));
  } catch (err) {
    logger.error('[customerOnboarding] Failed to decrypt taxId', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export function withEncryptedTaxId<T extends { taxId: string }>(input: T): T {
  return {
    ...input,
    taxId: encryptTaxId(input.taxId),
  };
}

export function serializeOrganizationRequest(request: null): null;
export function serializeOrganizationRequest(request: OrganizationRequestLike): OrganizationRecord;
export function serializeOrganizationRequest(request: OrganizationRequestLike | null): OrganizationRecord | null;
export function serializeOrganizationRequest(request: OrganizationRequestLike | null): OrganizationRecord | null {
  if (!request) return request;
  const plain = typeof request.toObject === 'function'
    ? request.toObject()
    : { ...(request as Record<string, unknown>) };
  return {
    ...plain,
    orgId: resolveReadableOrgId(plain.orgId),
    taxId: decryptTaxId(typeof plain.taxId === 'string' ? plain.taxId : undefined),
  };
}

export function serializeOrganizationRequests<T extends OrganizationRequestLike>(requests: T[]): OrganizationRecord[] {
  return requests.map((request) => serializeOrganizationRequest(request));
}
