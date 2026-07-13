'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTenantServices } from '@/context/TenantServicesContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import type { TenantServiceKey } from '@/types/tenantPortal';

interface RequireTenantServiceProps {
  serviceKey: TenantServiceKey;
  children: React.ReactNode;
}

/** Redirects to the services hub when the required service is not active. */
export function RequireTenantService({ serviceKey, children }: RequireTenantServiceProps) {
  const router = useRouter();
  const { accentColor } = useTenantBranding();
  const { loading, hasActiveService } = useTenantServices();
  const allowed = hasActiveService(serviceKey);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace('/tenant/console');
    }
  }, [loading, allowed, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
