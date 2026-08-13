import type { AdminServiceKey } from '@/lib/adminServicesApi';
import type { TenantServiceKey } from '@/types/tenantPortal';

/** Docs topics mapped to product entitlements. */
export type DocsTopicKey = 'vps' | 'esi' | 'azure' | 'aws';

export const DOCS_TOPIC_SERVICE_KEY: Record<DocsTopicKey, AdminServiceKey & TenantServiceKey> = {
  vps: 'vm-management',
  esi: 'elastic-servers',
  azure: 'azure',
  aws: 'aws',
};

export function isDocsTopicAllowed(
  topic: DocsTopicKey,
  hasActiveService: (key: AdminServiceKey | TenantServiceKey) => boolean
): boolean {
  return hasActiveService(DOCS_TOPIC_SERVICE_KEY[topic]);
}

export function filterDocsTopics<T extends { topic: DocsTopicKey }>(
  items: T[],
  hasActiveService: (key: AdminServiceKey | TenantServiceKey) => boolean
): T[] {
  return items.filter((item) => isDocsTopicAllowed(item.topic, hasActiveService));
}
