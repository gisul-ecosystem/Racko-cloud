import { TenantAuthProvider } from '@/context/TenantAuthContext';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { TenantServicesProvider } from '@/context/TenantServicesContext';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';

export async function generateMetadata() {
  return buildTenantMetadata();
}

/** Tenant sign-in lives under /console/login; needs tenant providers, not platform console shell. */
export default function ConsoleLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantAuthProvider>
      <TenantBrandingProvider>
        <TenantServicesProvider>
          <div className="min-h-screen bg-gray-50 text-gray-900">
            <TenantBrandingHead />
            {children}
          </div>
        </TenantServicesProvider>
      </TenantBrandingProvider>
    </TenantAuthProvider>
  );
}
