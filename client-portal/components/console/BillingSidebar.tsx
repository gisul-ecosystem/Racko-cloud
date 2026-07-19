'use client';

import { ServiceNavSidebar } from './ServiceNavSidebar';
import { Wallet } from 'lucide-react';

export function BillingSidebar({
  sidebarOpen,
  onCloseSidebar,
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  return (
    <ServiceNavSidebar
      title="Billing"
      subtitle="Wallet & transactions"
      footerHref="/console"
      footerLabel="All services"
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      links={[
        {
          href: '/dashboard/admin/billing',
          label: 'Wallet',
          icon: <Wallet className="h-4 w-4" />,
          exact: true,
        },
      ]}
    />
  );
}
