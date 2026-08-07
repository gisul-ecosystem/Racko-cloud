'use client';

import { useParams } from 'next/navigation';
import { VMConsoleView } from '@/components/console/VMConsoleView';
import { openTenantVmConsole } from '@/lib/tenantVmApi';
import { tenantVps } from '@/lib/tenantAdminRoutes';
import type { ConsoleProtocol, ConsoleSession } from '@/lib/consoleApi';

async function getTenantSession(
  vmId: string,
  protocol: ConsoleProtocol,
  dimensions?: { width?: number; height?: number }
): Promise<ConsoleSession> {
  const session = await openTenantVmConsole(vmId, protocol, dimensions);
  return {
    clientUrl: session.clientUrl,
    connectionId: session.connectionId,
    protocol: (session.protocol as ConsoleProtocol) || protocol,
  };
}

export default function TenantAdminVmConsolePage() {
  const { vmId } = useParams<{ vmId: string }>();
  const detailHref = vmId ? tenantVps.vm(vmId) : tenantVps.vms;

  return (
    <VMConsoleView
      backHref={detailHref}
      disconnectHref={tenantVps.vms}
      getSession={getTenantSession}
    />
  );
}
