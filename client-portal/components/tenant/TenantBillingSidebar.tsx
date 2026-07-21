'use client';

import { Wallet } from 'lucide-react';
import { ServiceNavSidebar } from '@/components/console/ServiceNavSidebar';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TENANT_CONSOLE, tenantVps } from '@/lib/tenantAdminRoutes';

export function TenantBillingSidebar({
  sidebarOpen,
  onCloseSidebar,
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  const { accentColor } = useTenantBranding();

  return (
    <ServiceNavSidebar
      title="Billing"
      subtitle="Wallet & transactions"
      footerHref={TENANT_CONSOLE}
      footerLabel="All services"
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      accentColor={accentColor}
      links={[
        {
          href: tenantVps.billing,
          label: 'Wallet',
          icon: <Wallet className="h-4 w-4" />,
          exact: true,
        },
      ]}
    />
  );
}
