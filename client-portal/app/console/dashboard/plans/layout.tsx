'use client';

import { RequireTenantService } from '@/components/tenant/RequireTenantService';

export default function TenantPlansSectionLayout({ children }: { children: React.ReactNode }) {
  return <RequireTenantService serviceKey="vm-management">{children}</RequireTenantService>;
}
