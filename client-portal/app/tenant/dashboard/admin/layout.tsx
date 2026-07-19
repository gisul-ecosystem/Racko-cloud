'use client';

import { usePathname } from 'next/navigation';
import { TenantVpsAdminShell } from '@/components/tenant/TenantVpsAdminShell';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { isTenantEndUserResourcesPath } from '@/lib/tenantPortalRoutes';

export default function TenantAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { tenantUser } = useTenantAuth();
  const isBilling = pathname.startsWith('/tenant/dashboard/admin/billing');
  const isEndUserResources =
    tenantUser?.role === 'tenant_user' && isTenantEndUserResourcesPath(pathname);

  const shell = <TenantVpsAdminShell>{children}</TenantVpsAdminShell>;

  if (isBilling || isEndUserResources) {
    return shell;
  }

  return <RequireTenantService serviceKey="vm-management">{shell}</RequireTenantService>;
}
