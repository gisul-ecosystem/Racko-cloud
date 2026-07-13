'use client';

import { apiRequest } from '@/lib/apiClient';
import { tenantPortalRequest } from '@/lib/tenantPortalApiClient';

export const TENANT_AZURE_CLOUD_API_PREFIX = '/api/v1/tenant-cloud/azure';
export const TENANT_AWS_CLOUD_API_PREFIX = '/api/v1/tenant-cloud/aws';
export const PLATFORM_AZURE_CLOUD_API_PREFIX = '/api/v1/cloud-automation';
export const PLATFORM_AWS_CLOUD_API_PREFIX = '/api/v1/cloud-automation-aws';

/** True when the browser is on a tenant portal route. */
export function isTenantPortalClient(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/tenant');
}

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

type RequestOptions = RequestInit & { skipAuth?: boolean };

/**
 * Routes cloud-automation calls through tenant or platform auth based on the current portal.
 */
export async function cloudAutomationRequest<T>(
  provider: 'azure' | 'aws',
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const prefix = provider === 'azure' ? getAzureCloudApiPrefix() : getAwsCloudApiPrefix();
  const fullPath = `${prefix}${normalized}`;

  if (isTenantPortalClient()) {
    return tenantPortalRequest<T>(fullPath, options);
  }

  return apiRequest<T>(fullPath, options);
}
