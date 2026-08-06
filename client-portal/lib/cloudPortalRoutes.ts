'use client';

import { usePathname } from 'next/navigation';
import { AZURE_ROUTES } from '@/cloud_automation/constants';
import { AWS_ROUTES } from '@/cloud_automation_aws/constants';
import { CLOUD_LABS_ROUTES } from '@/cloud_automation_training/constants';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';
import { isTenantWorkspacePath } from '@/lib/portalMode';

/** Azure routes under platform /console, Cloud Labs, or tenant /console/dashboard. */
export function useAzureRoutes() {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/console/cloud-labs') || pathname.startsWith(`${TENANT_CONSOLE}/cloud-labs`)) {
    const base = pathname.startsWith(TENANT_CONSOLE)
      ? `${TENANT_CONSOLE}/cloud-labs/azure`
      : CLOUD_LABS_ROUTES.azureDashboard;
    const hub = pathname.startsWith(TENANT_CONSOLE)
      ? `${TENANT_CONSOLE}/cloud-labs`
      : CLOUD_LABS_ROUTES.hub;
    return {
      ...AZURE_ROUTES,
      dashboard: base,
      createRequest: `${base}/requests/new`,
      requestStatus: (id: number | string) => `${base}/requests/${id}`,
      consoleHub: hub,
    } as const;
  }
  if (isTenantWorkspacePath(pathname)) {
    return {
      ...AZURE_ROUTES,
      dashboard: `${TENANT_CONSOLE}/azure`,
      createRequest: `${TENANT_CONSOLE}/azure/requests/new`,
      requestStatus: (id: number | string) => `${TENANT_CONSOLE}/azure/requests/${id}`,
      consoleHub: TENANT_CONSOLE,
    } as const;
  }
  return AZURE_ROUTES;
}

/** AWS routes under platform /console or tenant /console/dashboard. */
export function useAwsRoutes() {
  const pathname = usePathname() ?? '';
  if (isTenantWorkspacePath(pathname)) {
    return {
      ...AWS_ROUTES,
      dashboard: `${TENANT_CONSOLE}/aws`,
      createRequest: `${TENANT_CONSOLE}/aws/requests/new`,
      requests: `${TENANT_CONSOLE}/aws/requests`,
      requestStatus: (id: string) => `${TENANT_CONSOLE}/aws/requests/${id}`,
      consoleHub: TENANT_CONSOLE,
    } as const;
  }
  return AWS_ROUTES;
}
