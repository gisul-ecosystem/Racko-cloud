'use client';

import { ExternalVMConsoleView } from '../../../../../../components/console/ExternalVMConsoleView';
import {
  fetchCatalogVm,
  getCatalogVmConsole,
} from '../../../../../../lib/vmCatalogApi';

export default function CatalogVmConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref="/console/create-vm/my-vms"
      disconnectHref="/console/create-vm/my-vms"
      fetchVm={async (id) => {
        const vm = await fetchCatalogVm(id);
        return { name: vm.planName };
      }}
      openConsole={getCatalogVmConsole}
    />
  );
}
