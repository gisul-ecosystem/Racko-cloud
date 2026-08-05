import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';
import { ManagePortalBrandShell } from '@/components/manage-portal/ManagePortalBrandShell';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';

export async function generateMetadata() {
  return buildTenantMetadata();
}

/** Brands Azure + AWS manage-users with tenant chrome when opened on a tenant domain. */
export default function ManageUsersLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantBrandingProvider>
      <TenantBrandingHead />
      <ManagePortalBrandShell>{children}</ManagePortalBrandShell>
    </TenantBrandingProvider>
  );
}
