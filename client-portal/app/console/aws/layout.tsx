'use client';

import { AwsDashboardLayout } from '../../../cloud_automation_aws/components/AwsDashboardLayout';
import { RequireAdminService } from '../../../components/console/RequireAdminService';

export default function AwsConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdminService serviceKey="aws">
      <AwsDashboardLayout>{children}</AwsDashboardLayout>
    </RequireAdminService>
  );
}
