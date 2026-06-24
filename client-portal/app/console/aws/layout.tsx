'use client';

import { AwsDashboardLayout } from '../../../cloud_automation_aws/components/AwsDashboardLayout';

export default function AwsConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AwsDashboardLayout>{children}</AwsDashboardLayout>;
}
