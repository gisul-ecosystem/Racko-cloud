'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';

/** Platform auth only — tenant routes use TenantAuthProvider under /tenant. */
export default function AuthProviderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/tenant')) {
    return <>{children}</>;
  }

  return <AuthProvider>{children}</AuthProvider>;
}
