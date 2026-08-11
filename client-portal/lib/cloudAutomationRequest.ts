'use client';

import { apiRequest } from '@/lib/apiClient';
import { directGatewayRequest } from '@/lib/directGatewayRequest';
import { isTenantPortalClient } from '@/lib/portalClient';
import { tenantPortalRequest } from '@/lib/tenantPortalApiClient';

export const TENANT_AZURE_CLOUD_API_PREFIX = '/api/v1/tenant-cloud/azure';
export const TENANT_AWS_CLOUD_API_PREFIX = '/api/v1/tenant-cloud/aws';
export const TENANT_GCP_CLOUD_API_PREFIX = '/api/v1/tenant-cloud/gcp';
export const PLATFORM_AZURE_CLOUD_API_PREFIX = '/api/v1/cloud-automation';
export const PLATFORM_AWS_CLOUD_API_PREFIX = '/api/v1/cloud-automation-aws';
export const PLATFORM_GCP_CLOUD_API_PREFIX = '/api/v1/cloud-automation-gcp';

export function getAzureCloudApiPrefix(): string {
  return isTenantPortalClient()
    ? TENANT_AZURE_CLOUD_API_PREFIX
    : PLATFORM_AZURE_CLOUD_API_PREFIX;
}

export function getAwsCloudApiPrefix(): string {
  return isTenantPortalClient()
    ? TENANT_AWS_CLOUD_API_PREFIX
    : PLATFORM_AWS_CLOUD_API_PREFIX;
}

export function getGcpCloudApiPrefix(): string {
  return isTenantPortalClient()
    ? TENANT_GCP_CLOUD_API_PREFIX
    : PLATFORM_GCP_CLOUD_API_PREFIX;
}

type RequestOptions = RequestInit & { skipAuth?: boolean };

function shouldBypassNextProxy(path: string, method?: string): boolean {
  const normalized = path.toLowerCase();
  const httpMethod = (method || 'GET').toUpperCase();

  if (normalized.includes('/provision/request/')) {
    return httpMethod === 'POST' || httpMethod === 'GET';
  }

  // VM SKU region lookups call Azure and can exceed Next rewrite idle limits.
  if (normalized.includes('/services/available-locations')) {
    return httpMethod === 'GET' || httpMethod === 'POST';
  }

  return false;
}

/**
 * Routes cloud-automation calls through tenant or platform auth based on the current portal.
 * Long-running provision calls bypass the Next.js rewrite proxy to avoid socket hang-ups.
 */
export async function cloudAutomationRequest<T>(
  provider: 'azure' | 'aws' | 'gcp',
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const prefix =
    provider === 'azure'
      ? getAzureCloudApiPrefix()
      : provider === 'aws'
        ? getAwsCloudApiPrefix()
        : getGcpCloudApiPrefix();
  const fullPath = `${prefix}${normalized}`;

  if (typeof window !== 'undefined' && shouldBypassNextProxy(normalized, options.method)) {
    return directGatewayRequest<T>(fullPath, options);
  }

  if (isTenantPortalClient()) {
    return tenantPortalRequest<T>(fullPath, options);
  }

  return apiRequest<T>(fullPath, options);
}
