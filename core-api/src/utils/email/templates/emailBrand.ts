import type { ITenantBranding } from '../../../models/tenant.model';
import { getAppBaseUrl } from '../../requestContext';
import { defaultPlatformBrand, type EmailBrand } from './brandedLayout';

export interface TenantEmailContext {
  name: string;
  domain: string;
  branding?: ITenantBranding | null;
}

function absoluteOriginFromDomain(domain: string): string {
  const trimmed = domain.trim().replace(/\/$/, '');
  if (!trimmed) return getAppBaseUrl();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Local / IP hosts stay http; public domains use https.
  const isLocal =
    /^localhost(?::\d+)?$/i.test(trimmed) ||
    /^127\./.test(trimmed) ||
    /^\[::1\]/.test(trimmed);
  return `${isLocal ? 'http' : 'https'}://${trimmed}`;
}

/** localhost / loopback / private LAN portal — cannot reach a tenant's public domain. */
function isDevOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
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
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // Invites sent from a dev portal must stay on that origin; the tenant's public
  // domain has no DNS/route locally, so those links would be dead on arrival.
  const requestOrigin = getAppBaseUrl();
  const base = isDevOrigin(requestOrigin)
    ? requestOrigin
    : absoluteOriginFromDomain(tenant.domain);
  return `${base}${normalized}`;
}
