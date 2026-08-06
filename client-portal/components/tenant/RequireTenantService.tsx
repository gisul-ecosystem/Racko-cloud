'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTenantServices } from '@/context/TenantServicesContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { canAccessTenantService } from '@/lib/tenantServicePermissions';
import type { TenantServiceKey } from '@/types/tenantPortal';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

interface RequireTenantServiceProps {
  serviceKey: TenantServiceKey;
  children: React.ReactNode;
  /**
   * When true, the gate sits inside an existing light shell — use an inline
   * spinner. When false (default), paint a full light page so the root dark
   * body never flashes during the check.
   */
  embedded?: boolean;
}

/** Redirects to the services hub when the service is inactive or RBAC denies access. */
export function RequireTenantService({
  serviceKey,
  children,
  embedded = false,
}: RequireTenantServiceProps) {
  const router = useRouter();
  const { accentColor } = useTenantBranding();
  const { loading, hasActiveService } = useTenantServices();
  const { loading: rbacLoading, isTenantAdmin, hasPermission } = useTenantRbac();
  const serviceActive = hasActiveService(serviceKey);
  const rbacAllowed = canAccessTenantService(serviceKey, hasPermission, isTenantAdmin);
  const allowed = serviceActive && rbacAllowed;
  const checking = loading || rbacLoading;

  useEffect(() => {
    if (!checking && !allowed) {
      router.replace(TENANT_CONSOLE);
    }
  }, [checking, allowed, router]);

  if (checking || !allowed) {
    if (embedded) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: accentColor }} />
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  return <>{children}</>;
}
