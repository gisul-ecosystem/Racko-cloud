'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import {
  fetchTenantExternalVM,
  getTenantExternalVMConsole,
} from '@/lib/tenantExternalVmApi';
import { tenantConsole } from '@/lib/tenantAdminRoutes';

export default function TenantExternalVMConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref={tenantConsole.elastic}
      disconnectHref={tenantConsole.elastic}
      fetchVm={fetchTenantExternalVM}
      openConsole={getTenantExternalVMConsole}
    />
  );
}
