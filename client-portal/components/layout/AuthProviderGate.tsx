'use client';

import { AuthProvider } from '@/context/AuthContext';

/** Platform auth for all non-tenant-workspace trees. Tenant pages nest their own providers. */
export default function AuthProviderGate({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
