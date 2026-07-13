'use client';

import { RequireTenantService } from '@/components/tenant/RequireTenantService';

export default function TenantVmSectionLayout({ children }: { children: React.ReactNode }) {
  return <RequireTenantService serviceKey="vm-management">{children}</RequireTenantService>;
}
