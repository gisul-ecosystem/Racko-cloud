import type { MyVmDashboardScope } from './myVmDashboard.types';

export function platformVmPaths(
  scope: MyVmDashboardScope,
  id: string,
  protocol?: string | null
): { consolePath: string; managePath: string } {
  if (scope === 'tenant') {
    const consolePath = protocol
      ? `/console/dashboard/admin/vms/${id}/console?protocol=${encodeURIComponent(protocol)}`
      : `/console/dashboard/admin/vms/${id}/console`;
    return {
      consolePath,
      managePath: `/console/dashboard/admin/vms/${id}`,
    };
  }
  const consolePath = protocol
    ? `/dashboard/admin/vms/${id}/console?protocol=${encodeURIComponent(protocol)}`
    : `/dashboard/admin/vms/${id}/console`;
  return {
    consolePath,
    managePath: `/dashboard/admin/vms/${id}`,
  };
}

export function catalogVmPaths(
  scope: MyVmDashboardScope,
  id: string,
  instanceId?: string
): { consolePath: string; managePath: string } {
  const instanceQs = instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : '';
  if (scope === 'tenant') {
    return {
      consolePath: `/console/dashboard/create-vm/my-vms/${id}/console${instanceQs}`,
      managePath: '/console/dashboard/create-vm/my-vms',
    };
  }
  return {
    consolePath: `/console/create-vm/my-vms/${id}/console${instanceQs}`,
    managePath: '/console/create-vm/my-vms',
  };
}

export function externalVmPaths(
  scope: MyVmDashboardScope,
  id: string
): { consolePath: string; managePath: string } {
  if (scope === 'tenant') {
    return {
      consolePath: `/console/dashboard/elastic-servers/${id}/console`,
      managePath: '/console/dashboard/elastic-servers',
    };
  }
  return {
    consolePath: `/console/elastic-servers/${id}/console`,
    managePath: '/console/elastic-servers',
  };
}
