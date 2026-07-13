'use client';

import { usePathname } from 'next/navigation';
import { TenantVpsAdminShell } from '@/components/tenant/TenantVpsAdminShell';
import { RequireTenantService } from '@/components/tenant/RequireTenantService';

export default function TenantAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isBilling = pathname.startsWith('/tenant/dashboard/admin/billing');

  const shell = <TenantVpsAdminShell>{children}</TenantVpsAdminShell>;

  if (isBilling) {
    return shell;
  }

  return <RequireTenantService serviceKey="vm-management">{shell}</RequireTenantService>;
}
