import { config } from '../../../config';
import type { ITenantBranding } from '../../../models/tenant.model';
import { defaultPlatformBrand, type EmailBrand } from './brandedLayout';

export interface TenantEmailContext {
  name: string;
  domain: string;
  branding?: ITenantBranding | null;
}

function absoluteOriginFromDomain(domain: string): string {
  const trimmed = domain.trim().replace(/\/$/, '');
  if (!trimmed) return config.FRONTEND_URL.replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Local / IP hosts stay http; public domains use https.
  const isLocal =
    /^localhost(?::\d+)?$/i.test(trimmed) ||
    /^127\./.test(trimmed) ||
    /^\[::1\]/.test(trimmed);
  return `${isLocal ? 'http' : 'https'}://${trimmed}`;
}

function resolveLogoUrl(logoUrl: string | undefined, websiteUrl: string): string | undefined {
  const raw = (logoUrl ?? '').trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `${websiteUrl}${raw}`;
  return `${websiteUrl}/${raw}`;
}

/** Platform (Racko / EMAIL_FROM_NAME) branding for org-level emails. */
export function resolvePlatformEmailBrand(): EmailBrand {
  return defaultPlatformBrand();
}

/** White-label branding for tenant portal emails. */
export function resolveTenantEmailBrand(tenant: TenantEmailContext): EmailBrand {
  const websiteUrl = absoluteOriginFromDomain(tenant.domain);
  let websiteLabel = tenant.domain.trim().replace(/^https?:\/\//i, '');
  try {
    websiteLabel = new URL(websiteUrl).host;
  } catch {
    // keep domain as label
  }

  const branding = tenant.branding ?? {};
  const primary =
    (branding.primaryColor || '').trim() ||
    (branding.secondaryColor || '').trim() ||
    '#B91C1C';

  return {
    name: (tenant.name || '').trim() || websiteLabel,
    primaryColor: primary,
    secondaryColor: (branding.secondaryColor || '').trim() || undefined,
    logoUrl: resolveLogoUrl(branding.logoUrl, websiteUrl),
    websiteUrl,
    websiteLabel,
  };
}

export function tenantPortalUrl(tenant: TenantEmailContext, path: string): string {
  const base = absoluteOriginFromDomain(tenant.domain);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
