'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAdminServices } from '@/context/AdminServicesContext';
import type { AdminServiceKey } from '@/lib/adminServicesApi';

interface RequireAdminServiceProps {
  serviceKey: AdminServiceKey;
  children: React.ReactNode;
}

/** Redirects to the console hub when the required service is not active. */
export function RequireAdminService({ serviceKey, children }: RequireAdminServiceProps) {
  const router = useRouter();
  const { loading, hasActiveService } = useAdminServices();
  const allowed = hasActiveService(serviceKey);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace('/console');
    }
  }, [loading, allowed, router]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
