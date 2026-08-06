import { headers } from 'next/headers';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { ManagePortalTenantHead } from '@/components/manage-portal/ManagePortalTenantHead';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';
import {
  isLocalDevHost,
  isPlatformHost,
  shouldUseTenantManagePortalBranding,
} from '@/lib/gatewayUrl';
import SuperAdminConsoleClientLayout from './SuperAdminConsoleClientLayout';

function normalizeHost(raw: string): string {
  return raw.split(',')[0]?.trim().replace(/:\d+$/, '').toLowerCase() ?? '';
}

export async function generateMetadata() {
  const h = await headers();
  const host = normalizeHost(h.get('x-forwarded-host') ?? h.get('host') ?? '');

  // Platform / localhost keep the root Racko favicon.
  // On a tenant host (e.g. dev.racko.ai) use that tenant's Dev favicon/title.
  if (isPlatformHost(host) || isLocalDevHost(host) || !shouldUseTenantManagePortalBranding(host)) {
    return {
      title: 'Racko Super Admin',
      description: 'Infrastructure & cloud services administration.',
    };
  }

  return buildTenantMetadata();
}

export default function SuperAdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantBrandingProvider>
      <ManagePortalTenantHead />
      <SuperAdminConsoleClientLayout>{children}</SuperAdminConsoleClientLayout>
    </TenantBrandingProvider>
  );
}
