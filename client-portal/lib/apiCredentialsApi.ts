import { apiRequest } from './apiClient';
import { tenantPortalRequest } from './tenantPortalApiClient';

export const API_CREDENTIAL_SCOPES = [
  'vms:read',
  'vms:write',
  'vms:console',
  'vms:assign',
] as const;

export type ApiCredentialScope = (typeof API_CREDENTIAL_SCOPES)[number];

export interface ApiCredentialListItem {
  id: string;
  clientId: string;
  name: string;
  ownerType: 'tenant' | 'platform';
  tenantId: string | null;
  adminId: string | null;
  scopes: string[];
  rateLimitPerMin: number | null;
  status: 'active' | 'revoked';
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiCredentialUsageSummary {
  clientId: string;
  status: 'active' | 'revoked';
  scopes: string[];
  rateLimitPerMin: number | null;
  lastUsedAt: string | null;
  createdAt: string;
  windowHours: number;
  requestCountInWindow: number;
  statusCountsInWindow: Record<string, number>;
  recentCalls: Array<{
    method: string;
    route: string;
    statusCode: number;
    at: string;
  }>;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface CreateApiCredentialInput {
  name: string;
  scopes?: string[];
  rateLimitPerMin?: number | null;
}

export interface CreateApiCredentialResult {
  credential: ApiCredentialListItem;
  clientSecret: string;
}

export type ApiCredentialsRequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;

function createApiCredentialsClient(request: ApiCredentialsRequestFn) {
  const base = '/api/v1/api-credentials';

  return {
    list: async (): Promise<ApiCredentialListItem[]> => {
      const res = await request<ApiResponse<{ credentials: ApiCredentialListItem[] }>>(base);
      return res.data.credentials;
    },

    create: async (input: CreateApiCredentialInput): Promise<CreateApiCredentialResult> => {
      const res = await request<ApiResponse<CreateApiCredentialResult>>(base, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    },

    revoke: async (id: string): Promise<ApiCredentialListItem> => {
      const res = await request<ApiResponse<{ credential: ApiCredentialListItem }>>(
        `${base}/${id}/revoke`,
        { method: 'POST' }
      );
      return res.data.credential;
    },

    usage: async (id: string): Promise<ApiCredentialUsageSummary> => {
      const res = await request<ApiResponse<{ usage: ApiCredentialUsageSummary }>>(
        `${base}/${id}/usage`
      );
      return res.data.usage;
    },
  };
}

export const platformApiCredentialsClient = createApiCredentialsClient(apiRequest);
export const tenantApiCredentialsClient = createApiCredentialsClient(tenantPortalRequest);
