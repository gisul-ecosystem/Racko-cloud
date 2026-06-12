'use client';

import { AzureDashboardLayout } from '../../../cloud_automation/components/AzureDashboardLayout';

export default function AzureConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AzureDashboardLayout>{children}</AzureDashboardLayout>;
}
