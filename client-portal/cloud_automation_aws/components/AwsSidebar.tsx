'use client';

import { LayoutGrid, Plus } from 'lucide-react';
import { ServiceNavSidebar } from '../../components/console/ServiceNavSidebar';
import { useAwsShell } from '../hooks/useAwsShell';
import { useAwsRoutes } from '../../lib/cloudPortalRoutes';

export function AwsSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAwsShell();
  const AWS_ROUTES = useAwsRoutes();

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      title="AWS Services"
      subtitle="Cloud automation"
      links={[
        {
          href: AWS_ROUTES.dashboard,
          label: 'Overview',
          icon: <LayoutGrid className="h-4 w-4" />,
          exact: true,
        },
        {
          href: AWS_ROUTES.createRequest,
          label: 'Create request',
          icon: <Plus className="h-4 w-4" />,
        },
      ]}
      footerHref={AWS_ROUTES.consoleHub}
      footerLabel="All services"
    />
  );
}
