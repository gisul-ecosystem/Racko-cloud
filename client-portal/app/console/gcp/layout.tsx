'use client';

import { GcpDashboardLayout } from '../../../cloud_automation_gcp/components/GcpDashboardLayout';
import { RequireAdminService } from '../../../components/console/RequireAdminService';

export default function GcpConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdminService serviceKey="gcp">
      <GcpDashboardLayout>{children}</GcpDashboardLayout>
    </RequireAdminService>
  );
}
