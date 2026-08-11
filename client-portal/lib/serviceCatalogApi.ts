import { apiRequest } from './apiClient';

export type ServiceCatalogKind = 'product' | 'utility';
export type ServiceCatalogScope = 'admin' | 'tenant';
export type ServiceCatalogStatus = 'active' | 'deprecated' | 'hidden';

export interface ServiceCatalogItem {
  key: string;
  label: string;
  description: string;
  kind: ServiceCatalogKind;
  scopes: ServiceCatalogScope[];
  status: ServiceCatalogStatus;
  sortOrder: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function fetchServiceCatalog(params?: {
  kind?: ServiceCatalogKind;
  scope?: ServiceCatalogScope;
  include?: 'active' | 'all';
}): Promise<ServiceCatalogItem[]> {
  const search = new URLSearchParams();
  if (params?.kind) search.set('kind', params.kind);
  if (params?.scope) search.set('scope', params.scope);
  if (params?.include) search.set('include', params.include);
  const qs = search.toString();
  const res = await apiRequest<ApiEnvelope<{ services: ServiceCatalogItem[] }>>(
    `/api/v1/service-catalog${qs ? `?${qs}` : ''}`
  );
  return res.data.services;
}

/** Label map for project/hub display; falls back to key when missing. */
export function catalogLabelMap(items: ServiceCatalogItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    map[item.key] = item.label;
  }
  return map;
}
