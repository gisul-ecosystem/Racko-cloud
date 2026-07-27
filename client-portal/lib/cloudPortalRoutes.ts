'use client';

import { usePathname } from 'next/navigation';
import { AZURE_ROUTES } from '@/cloud_automation/constants';
import { AWS_ROUTES } from '@/cloud_automation_aws/constants';

/** Azure routes under /console or /tenant/console based on current path. */
export function useAzureRoutes() {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/tenant')) {
    return {
      ...AZURE_ROUTES,
      dashboard: '/tenant/console/azure',
      createRequest: '/tenant/console/azure/requests/new',
      requestStatus: (id: number | string) => `/tenant/console/azure/requests/${id}`,
      consoleHub: '/tenant/console',
    } as const;
  }
  return AZURE_ROUTES;
}

/** AWS routes under /console or /tenant/console based on current path. */
export function useAwsRoutes() {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/tenant')) {
    return {
      ...AWS_ROUTES,
      dashboard: '/tenant/console/aws',
      createRequest: '/tenant/console/aws/requests/new',
      requests: '/tenant/console/aws/requests',
      requestStatus: (id: string) => `/tenant/console/aws/requests/${id}`,
      consoleHub: '/tenant/console',
    } as const;
  }
  return AWS_ROUTES;
}
