'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import { useDedicatedServerPortal } from '@/context/DedicatedServerPortalContext';

export default function DedicatedServerConsolePage() {
  const { routes, api } = useDedicatedServerPortal();

  return (
    <ExternalVMConsoleView
      backHref={routes.myServers}
      disconnectHref={routes.myServers}
      fetchVm={async (id) => {
        const s = await api.fetchServer(id);
        return { name: s.planName };
      }}
      openConsole={api.getConsole}
    />
  );
}
