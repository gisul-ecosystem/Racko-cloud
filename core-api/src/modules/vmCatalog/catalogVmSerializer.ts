import type { CatalogVmResponse } from './vmCatalog.types';
import type { VmCatalogProvider } from '../../models/catalogVm.model';

const SUPER_ADMIN_ONLY_FIELDS = [
  'provider',
  'region',
  'providerInstanceId',
  'rawProviderCostPerHr',
] as const;

export type CatalogVmCallerRole = 'super_admin' | 'admin' | 'user' | string;

/**
 * Strip infra-identity fields from catalog VM responses for non-super_admin callers.
 */
export function stripProviderLeakFields<T extends Partial<CatalogVmResponse>>(
  response: T,
  role: CatalogVmCallerRole | undefined
): T {
  if (role === 'super_admin') {
    return response;
  }

  const out = { ...response };
  for (const key of SUPER_ADMIN_ONLY_FIELDS) {
    delete out[key];
  }
  return out;
}

export function specsToCanonicalSpec(
  specs: { cpu?: string; ram?: string; disk?: string } | undefined,
  category: string
): string {
  const cpu = String(specs?.cpu || '').replace(/[^\d]/g, '') || '2';
  const ram = String(specs?.ram || '').replace(/[^\d]/g, '') || '8';
  const disk = String(specs?.disk || '').replace(/[^\d]/g, '') || '50';
  const base = `${cpu}vcpu-${ram}gb-${disk}gbssd`;
  return category === 'gpu' ? `${base}-gpu` : base;
}

/**
 * Infer duration in days from billing period string or explicit durationDays.
 * hourly/daily → short (auto-cloud); monthly+ → webyne rule (>=30).
 */
export function resolveDurationDays(billing: string, explicit?: number): number {
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }
  const b = String(billing || '').toLowerCase();
  if (b.includes('year')) return 365;
  if (b.includes('quarter')) return 90;
  if (b.includes('month')) return 30;
  if (b.includes('week')) return 7;
  if (b.includes('day')) return 1;
  if (b.includes('hour')) return 1;
  return 30;
}

export function computeExpiresAt(durationDays: number): Date {
  const days = Math.max(1, durationDays);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function isAutoCloudProvider(
  provider: string | undefined
): provider is 'aws' | 'azure' | 'oci' | 'gcp' {
  return (
    provider === 'aws' ||
    provider === 'azure' ||
    provider === 'oci' ||
    provider === 'gcp'
  );
}

export type { VmCatalogProvider };
