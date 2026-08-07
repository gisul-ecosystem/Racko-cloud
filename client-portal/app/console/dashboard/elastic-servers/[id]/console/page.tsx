'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import {
  fetchTenantExternalVM,
  getTenantExternalVMConsole,
} from '@/lib/tenantExternalVmApi';
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';

export default function TenantExternalVMConsolePage() {
  const { tenantUser } = useTenantAuth();
  const { isConsoleStaff, hasPermission } = useTenantRbac();
  const canUseElasticAdmin =
    isConsoleStaff && hasPermission('elastic.manage', 'elastic.read');
  // End users land from My VMs; staff from the elastic list.
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
    />
  );
}
