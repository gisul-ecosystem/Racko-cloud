import { TenantAuthProvider } from '@/context/TenantAuthContext';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { TenantServicesProvider } from '@/context/TenantServicesContext';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';

export async function generateMetadata() {
  return buildTenantMetadata();
}

export default function TenantRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantAuthProvider>
      <TenantBrandingProvider>
        <TenantServicesProvider>
          {/* Light canvas so route transitions never flash the root dark body */}
          <div className="min-h-screen bg-gray-50 text-gray-900">
            <TenantBrandingHead />
            {children}
          </div>
        </TenantServicesProvider>
      </TenantBrandingProvider>
    </TenantAuthProvider>
  );
}
