import { TenantAuthProvider } from '@/context/TenantAuthContext';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';

export async function generateMetadata() {
  return buildTenantMetadata();
}

export default function TenantRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantAuthProvider>
      <TenantBrandingProvider>
        <TenantBrandingHead />
        {children}
      </TenantBrandingProvider>
    </TenantAuthProvider>
  );
}
