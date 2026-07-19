'use client';

import { AzureDashboardLayout } from '../../../cloud_automation/components/AzureDashboardLayout';
import { RequireAdminService } from '../../../components/console/RequireAdminService';

export default function AzureConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdminService serviceKey="azure">
      <AzureDashboardLayout>{children}</AzureDashboardLayout>
    </RequireAdminService>
  );
}
