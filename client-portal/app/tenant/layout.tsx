import { TenantAuthProvider } from '@/context/TenantAuthContext';

export default function TenantRootLayout({ children }: { children: React.ReactNode }) {
  return <TenantAuthProvider>{children}</TenantAuthProvider>;
}
