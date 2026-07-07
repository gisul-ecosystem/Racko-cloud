import { TenantAuthProvider } from '@/context/TenantAuthContext';
import { TenantBrandingProvider } from '@/context/TenantBrandingContext';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';

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
