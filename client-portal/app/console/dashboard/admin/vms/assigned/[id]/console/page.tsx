'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import {
  closeTenantExternalVMConsole,
  fetchTenantExternalVM,
  getTenantExternalVMConsole,
  startTenantConsoleSession,
  heartbeatTenantConsoleSession,
  endTenantConsoleSession,
} from '@/lib/tenantExternalVmApi';
import { endConsoleSessionBeacon } from '@/lib/consoleSessionApi';
import { getGatewayBaseUrl } from '@/lib/gatewayUrl';
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
      sessionTracking={{
        start: startTenantConsoleSession,
        heartbeat: heartbeatTenantConsoleSession,
        end: endTenantConsoleSession,
        endBeacon: (sessionId, _gatewayBaseUrl) =>
          endConsoleSessionBeacon(sessionId, getGatewayBaseUrl()),
      }}
    />
  );
}
