import { apiRequest } from './apiClient';
import {
  PLATFORM_AWS_CLOUD_API_PREFIX,
  PLATFORM_AZURE_CLOUD_API_PREFIX,
  PLATFORM_GCP_CLOUD_API_PREFIX,
} from './cloudAutomationRequest';

export interface CustomerCloudLabRequest {
  id: string;
  provider: 'azure' | 'aws' | 'gcp';
  customerEmail: string;
  status: string;
  region: string | null;
  costingMode: string | null;
  accountCount: number | null;
  estimatedPrice: number | null;
  requestName: string | null;
  createdAt: string | null;
  expiryDate: string | null;
  ownerId: string | null;
  /** True when we only know the id from a wallet debit (request fetch failed). */
  fromWalletOnly?: boolean;
  chargedInr?: number | null;
}

export interface CloudLabWalletLink {
  provider: 'azure' | 'aws' | 'gcp';
  requestId: string;
  chargedInr?: number;
  createdAt?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function ownerMatches(ownerId: string | null, targetOwnerId: string): boolean {
  if (!ownerId) return false;
  return String(ownerId) === String(targetOwnerId);
}

function normalizeAzureRequest(raw: unknown): CustomerCloudLabRequest {
  const row = asRecord(raw);
  return {
    id: asString(row.id) || '',
    provider: 'azure',
    customerEmail: asString(row.customer_email) || asString(row.customerEmail) || '—',
    status: asString(row.status) || 'Unknown',
    region: asString(row.location) || asString(row.region),
    costingMode: asString(row.costing_mode) || asString(row.costingMode),
    accountCount: asNumber(row.account_count) ?? asNumber(row.accountCount),
    estimatedPrice: asNumber(row.estimated_price) ?? asNumber(row.estimatedPrice),
    requestName:
      asString(row.azure_resource_group_name) ||
      asString(row.azureResourceGroupName) ||
      asString(row.project_name) ||
      asString(row.projectName),
    createdAt: asString(row.created_at) || asString(row.createdAt),
    expiryDate:
      asString(row.expiry_date) ||
      asString(row.expiryDate) ||
      asString(row.expires_at) ||
      asString(row.expiresAt),
    ownerId: asString(row.racko_user_id) || asString(row.rackoUserId),
  };
}

function normalizeGcpRequest(raw: unknown): CustomerCloudLabRequest {
  const row = asRecord(raw);
  const nested = asRecord(row.request);
  const source = Object.keys(nested).length > 0 ? { ...row, ...nested } : row;
  const id =
    asString(source._id) ||
    asString(source.id) ||
    asString(source.requestId) ||
    '';
  const identityUsers = Array.isArray(source.identityUsers) ? source.identityUsers : [];
  const accountCount =
    asNumber(source.accountCount) ??
    asNumber(source.account_count) ??
    (identityUsers.length || null);

  return {
    id,
    provider: 'gcp',
    customerEmail: asString(source.customerEmail) || asString(source.customer_email) || '—',
    status: asString(source.status) || 'Unknown',
    region: asString(source.region),
    costingMode: asString(source.costingMode) || asString(source.costing_mode),
    accountCount,
    estimatedPrice: asNumber(source.estimatedPrice) ?? asNumber(source.estimated_price),
    requestName:
      asString(source.requestName) ||
      asString(source.request_name) ||
      asString(source.projectName) ||
      asString(source.project_name),
    createdAt: asString(source.createdAt) || asString(source.created_at),
    expiryDate:
      asString(source.endDate) || asString(source.end_date) || asString(source.expiryDate),
    ownerId: asString(source.createdBy) || asString(source.created_by),
  };
}

function normalizeAwsRequest(raw: unknown): CustomerCloudLabRequest {
  const row = asRecord(raw);
  const nested = asRecord(row.request);
  const source = Object.keys(nested).length > 0 ? { ...row, ...nested } : row;
  const id =
    asString(source._id) ||
    asString(source.id) ||
    asString(source.requestId) ||
    '';
  const identityUsers = Array.isArray(source.identityUsers) ? source.identityUsers : [];
  const labRoles = Array.isArray(source.labRoles) ? source.labRoles : [];
  const accountCount =
    asNumber(source.accountCount) ??
    asNumber(source.account_count) ??
    (identityUsers.length || labRoles.length || null);

  return {
    id,
    provider: 'aws',
    customerEmail: asString(source.customerEmail) || asString(source.customer_email) || '—',
    status: asString(source.status) || 'Unknown',
    region: asString(source.region),
    costingMode: asString(source.costingMode) || asString(source.costing_mode),
    accountCount,
    estimatedPrice: asNumber(source.estimatedPrice) ?? asNumber(source.estimated_price),
    requestName: asString(source.requestName) || asString(source.request_name),
    createdAt: asString(source.createdAt) || asString(source.created_at),
    expiryDate:
      asString(source.endDate) || asString(source.end_date) || asString(source.expiryDate),
    ownerId: asString(source.createdBy) || asString(source.created_by),
  };
}

function mergeById(
  primary: CustomerCloudLabRequest[],
  secondary: CustomerCloudLabRequest[]
): CustomerCloudLabRequest[] {
  const map = new Map<string, CustomerCloudLabRequest>();
  for (const row of [...secondary, ...primary]) {
    if (!row.id) continue;
    const existing = map.get(row.id);
    map.set(row.id, existing && !row.fromWalletOnly ? { ...existing, ...row } : row);
  }
  return [...map.values()].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
}

/**
 * Admin wallet stores cloud request ids on `relatedVmJobId` after charge/link.
 */
export function extractCloudLabLinksFromWalletTransactions(
  transactions: Array<{
    id?: string;
    reason?: string | null;
    relatedVmJobId?: string | null;
    amount?: number;
    createdAt?: string;
    type?: string;
  }>
): { links: CloudLabWalletLink[]; unlinked: CustomerCloudLabRequest[] } {
  const links: CloudLabWalletLink[] = [];
  const unlinked: CustomerCloudLabRequest[] = [];
  const seen = new Set<string>();

  for (const tx of transactions) {
    if (tx.type && tx.type !== 'debit') continue;

    let provider: 'azure' | 'aws' | 'gcp' | null = null;
    if (tx.reason === 'azure_lab_request') provider = 'azure';
    if (tx.reason === 'aws_lab_request') provider = 'aws';
    if (tx.reason === 'gcp_lab_request') provider = 'gcp';
    if (!provider) continue;

    const requestId = String(tx.relatedVmJobId || '').trim();
    if (!requestId) {
      unlinked.push({
        id: `wallet-${tx.id || `${provider}-${tx.createdAt || Math.random()}`}`,
        provider,
        customerEmail: '—',
        status: 'Charged',
        region: null,
        costingMode: null,
        accountCount: null,
        estimatedPrice: null,
        requestName: 'Unlinked wallet charge',
        createdAt: tx.createdAt || null,
        expiryDate: null,
        ownerId: null,
        fromWalletOnly: true,
        chargedInr: typeof tx.amount === 'number' ? tx.amount : null,
      });
      continue;
    }

    const key = `${provider}:${requestId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    links.push({
      provider,
      requestId,
      chargedInr: typeof tx.amount === 'number' ? tx.amount : undefined,
      createdAt: tx.createdAt,
    });
  }

  return { links, unlinked };
}

async function fetchAzureRequestById(id: string): Promise<CustomerCloudLabRequest | null> {
  try {
    const res = await apiRequest<{ success: boolean; data?: unknown }>(
      `${PLATFORM_AZURE_CLOUD_API_PREFIX}/requests/${encodeURIComponent(id)}`
    );
    const normalized = normalizeAzureRequest(res.data);
    return normalized.id ? normalized : null;
  } catch {
    return null;
  }
}

async function fetchAwsRequestById(id: string): Promise<CustomerCloudLabRequest | null> {
  try {
    const res = await apiRequest<{ success: boolean; request?: unknown; data?: unknown }>(
      `${PLATFORM_AWS_CLOUD_API_PREFIX}/requests/${encodeURIComponent(id)}`
    );
    const normalized = normalizeAwsRequest(res.request ?? res.data ?? res);
    return normalized.id ? normalized : null;
  } catch {
    return null;
  }
}

async function fetchGcpRequestById(id: string): Promise<CustomerCloudLabRequest | null> {
  try {
    const res = await apiRequest<{ success: boolean; request?: unknown; data?: unknown }>(
      `${PLATFORM_GCP_CLOUD_API_PREFIX}/requests/${encodeURIComponent(id)}`
    );
    const normalized = normalizeGcpRequest(res.request ?? res.data ?? res);
    return normalized.id ? normalized : null;
  } catch {
    return null;
  }
}

async function hydrateFromWalletLinks(
  links: CloudLabWalletLink[]
): Promise<{ azure: CustomerCloudLabRequest[]; aws: CustomerCloudLabRequest[]; gcp: CustomerCloudLabRequest[] }> {
  const azureLinks = links.filter((l) => l.provider === 'azure');
  const awsLinks = links.filter((l) => l.provider === 'aws');
  const gcpLinks = links.filter((l) => l.provider === 'gcp');

  const [azureRows, awsRows, gcpRows] = await Promise.all([
    Promise.all(
      azureLinks.map(async (link) => {
        const found = await fetchAzureRequestById(link.requestId);
        if (found) {
          return {
            ...found,
            chargedInr: link.chargedInr ?? null,
            createdAt: found.createdAt || link.createdAt || null,
          };
        }
        return {
          id: link.requestId,
          provider: 'azure' as const,
          customerEmail: '—',
          status: 'Charged',
          region: null,
          costingMode: null,
          accountCount: null,
          estimatedPrice: null,
          requestName: `Request #${link.requestId}`,
          createdAt: link.createdAt || null,
          expiryDate: null,
          ownerId: null,
          fromWalletOnly: true,
          chargedInr: link.chargedInr ?? null,
        };
      })
    ),
    Promise.all(
      awsLinks.map(async (link) => {
        const found = await fetchAwsRequestById(link.requestId);
        if (found) {
          return {
            ...found,
            chargedInr: link.chargedInr ?? null,
            createdAt: found.createdAt || link.createdAt || null,
          };
        }
        return {
          id: link.requestId,
          provider: 'aws' as const,
          customerEmail: '—',
          status: 'Charged',
          region: null,
          costingMode: null,
          accountCount: null,
          estimatedPrice: null,
          requestName: `Request #${link.requestId}`,
          createdAt: link.createdAt || null,
          expiryDate: null,
          ownerId: null,
          fromWalletOnly: true,
          chargedInr: link.chargedInr ?? null,
        };
      })
    ),
    Promise.all(
      gcpLinks.map(async (link) => {
        const found = await fetchGcpRequestById(link.requestId);
        if (found) {
          return {
            ...found,
            chargedInr: link.chargedInr ?? null,
            createdAt: found.createdAt || link.createdAt || null,
          };
        }
        return {
          id: link.requestId,
          provider: 'gcp' as const,
          customerEmail: '—',
          status: 'Charged',
          region: null,
          costingMode: null,
          accountCount: null,
          estimatedPrice: null,
          requestName: `Request #${link.requestId}`,
          createdAt: link.createdAt || null,
          expiryDate: null,
          ownerId: null,
          fromWalletOnly: true,
          chargedInr: link.chargedInr ?? null,
        };
      })
    ),
  ]);

  return { azure: azureRows, aws: awsRows, gcp: gcpRows };
}

/**
 * Cloud lab requests for a Racko customer / tenant.
 * Prefer wallet-linked request ids (reliable), and merge ownerId list when available.
 */
export async function fetchCloudLabsForOwner(
  ownerId: string,
  options?: {
    walletLinks?: CloudLabWalletLink[];
    unlinkedWalletLabs?: CustomerCloudLabRequest[];
  }
): Promise<{
  azure: CustomerCloudLabRequest[];
  aws: CustomerCloudLabRequest[];
  gcp: CustomerCloudLabRequest[];
}> {
  const walletLinks = options?.walletLinks ?? [];
  const unlinkedWalletLabs = options?.unlinkedWalletLabs ?? [];

  const [ownerLists, walletHydrated] = await Promise.all([
    Promise.all([
      apiRequest<{ success: boolean; data?: unknown[] }>(
        `${PLATFORM_AZURE_CLOUD_API_PREFIX}/requests?ownerId=${encodeURIComponent(ownerId)}`
      ).catch(() => ({ success: false, data: [] as unknown[] })),
      apiRequest<{ success: boolean; data?: unknown[] }>(
        `${PLATFORM_AWS_CLOUD_API_PREFIX}/requests?ownerId=${encodeURIComponent(ownerId)}`
      ).catch(() => ({ success: false, data: [] as unknown[] })),
      apiRequest<{ success: boolean; data?: unknown[] }>(
        `${PLATFORM_GCP_CLOUD_API_PREFIX}/requests?ownerId=${encodeURIComponent(ownerId)}`
      ).catch(() => ({ success: false, data: [] as unknown[] })),
    ]),
    walletLinks.length > 0
      ? hydrateFromWalletLinks(walletLinks)
      : Promise.resolve({
          azure: [] as CustomerCloudLabRequest[],
          aws: [] as CustomerCloudLabRequest[],
          gcp: [] as CustomerCloudLabRequest[],
        }),
  ]);

  const [azureRes, awsRes, gcpRes] = ownerLists;

  const azureOwned = (azureRes.data ?? [])
    .map(normalizeAzureRequest)
    .filter((row) => row.id && (!row.ownerId || ownerMatches(row.ownerId, ownerId)));

  const awsOwned = (awsRes.data ?? [])
    .map(normalizeAwsRequest)
    .filter((row) => row.id && (!row.ownerId || ownerMatches(row.ownerId, ownerId)));

  const gcpOwned = (gcpRes.data ?? [])
    .map(normalizeGcpRequest)
    .filter((row) => row.id && (!row.ownerId || ownerMatches(row.ownerId, ownerId)));

  const unlinkedAzure = unlinkedWalletLabs.filter((r) => r.provider === 'azure');
  const unlinkedAws = unlinkedWalletLabs.filter((r) => r.provider === 'aws');
  const unlinkedGcp = unlinkedWalletLabs.filter((r) => r.provider === 'gcp');

  return {
    azure: mergeById(mergeById(walletHydrated.azure, azureOwned), unlinkedAzure),
    aws: mergeById(mergeById(walletHydrated.aws, awsOwned), unlinkedAws),
    gcp: mergeById(mergeById(walletHydrated.gcp, gcpOwned), unlinkedGcp),
  };
}

export function tenantCloudOwnerId(tenantId: string): string {
  return `tenant:${tenantId}`;
}
