import { TenantAuthProvider } from '@/context/TenantAuthContext';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { TenantServicesProvider } from '@/context/TenantServicesContext';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';
import { TenantConsoleAuthGate } from '@/components/tenant/TenantConsoleAuthGate';
import { buildTenantMetadata } from '@/lib/tenantBrandingServer';

export async function generateMetadata() {
  return buildTenantMetadata();
}

/** Tenant workspace console at /console/dashboard — tenant providers, not platform shell. */
export default function ConsoleDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantAuthProvider>
      <TenantBrandingProvider>
        <TenantServicesProvider>
          <div className="min-h-screen bg-gray-50 text-gray-900">
            <TenantBrandingHead />
            <TenantConsoleAuthGate>{children}</TenantConsoleAuthGate>
          </div>
        </TenantServicesProvider>
      </TenantBrandingProvider>
    </TenantAuthProvider>
  );
}
