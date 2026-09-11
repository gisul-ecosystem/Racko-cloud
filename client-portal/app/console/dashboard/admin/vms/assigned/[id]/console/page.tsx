'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import {
  closeTenantExternalVMConsole,
  fetchTenantExternalVM,
  getTenantExternalVMConsole,
} from '@/lib/tenantExternalVmApi';
import { tenantVps } from '@/lib/tenantAdminRoutes';

/**
 * Console for servers assigned via super-admin Server Assign.
 * Lives under My VMs so the Elastic Servers product entitlement cannot block it.
 */
export default function TenantAssignedServerConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref={tenantVps.vms}
      disconnectHref={tenantVps.vms}
      fetchVm={fetchTenantExternalVM}
      openConsole={getTenantExternalVMConsole}
      closeSession={closeTenantExternalVMConsole}
    />
  );
}
