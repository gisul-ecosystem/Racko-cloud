'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { TenantShell } from '@/components/tenant/TenantShell';

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useTenantAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/tenant/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  return <TenantShell>{children}</TenantShell>;
}
