import { headers } from 'next/headers';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { ManagePortalBrandShell } from '@/components/manage-portal/ManagePortalBrandShell';
import { ManagePortalTenantHead } from '@/components/manage-portal/ManagePortalTenantHead';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';
import {
  isLocalDevHost,
  isPlatformHost,
  shouldUseTenantManagePortalBranding,
} from '@/lib/gatewayUrl';

function normalizeHost(raw: string): string {
  return raw.split(',')[0]?.trim().replace(/:\d+$/, '').toLowerCase() ?? '';
}

export async function generateMetadata() {
  const h = await headers();
  const host = normalizeHost(h.get('x-forwarded-host') ?? h.get('host') ?? '');

  // Admin / platform / localhost manage portal stays Racko — do not inherit TENANT_DEV_DOMAIN.
  if (isPlatformHost(host) || isLocalDevHost(host) || !shouldUseTenantManagePortalBranding(host)) {
    return {
      title: 'Racko Manage Portal',
      description: 'Manage provisioned lab users and launch cloud consoles.',
    };
  }

  return buildTenantMetadata();
}

/** Brands Azure + AWS manage-users with tenant chrome only on tenant domains. */
export default function ManageUsersLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantBrandingProvider>
      <ManagePortalTenantHead />
      <ManagePortalBrandShell>{children}</ManagePortalBrandShell>
    </TenantBrandingProvider>
  );
}
