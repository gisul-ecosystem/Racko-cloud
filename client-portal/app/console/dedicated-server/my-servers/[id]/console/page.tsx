'use client';

import { ExternalVMConsoleView } from '@/components/console/ExternalVMConsoleView';
import {
  fetchDedicatedServer,
  getDedicatedServerConsole,
} from '@/lib/dedicatedServerApi';

export default function DedicatedServerConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref="/console/dedicated-server/my-servers"
      disconnectHref="/console/dedicated-server/my-servers"
      fetchVm={async (id) => {
        const s = await fetchDedicatedServer(id);
        return { name: s.planName };
      }}
      openConsole={getDedicatedServerConsole}
    />
  );
}
