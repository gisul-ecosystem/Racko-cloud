'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
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
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';

export default function TenantExternalVMConsolePage() {
  const { tenantUser } = useTenantAuth();
  const { isConsoleStaff, hasPermission } = useTenantRbac();
  const canUseElasticAdmin =
    isConsoleStaff && hasPermission('elastic.manage', 'elastic.read');
  const listHref =
    tenantUser?.role === 'tenant_user' && !canUseElasticAdmin
      ? tenantVps.vms
      : tenantConsole.elastic;

  return (
    <ExternalVMConsoleView
      backHref={listHref}
      disconnectHref={listHref}
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
