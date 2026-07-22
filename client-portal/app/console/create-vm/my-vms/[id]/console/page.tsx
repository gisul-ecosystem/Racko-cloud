'use client';

import { ExternalVMConsoleView } from '../../../../../../components/console/ExternalVMConsoleView';
import { useVmCatalogPortal } from '../../../../../../context/VmCatalogPortalContext';

export default function CatalogVmConsolePage() {
  const { routes, api } = useVmCatalogPortal();

  return (
    <ExternalVMConsoleView
      backHref={routes.myVms}
      disconnectHref={routes.myVms}
      fetchVm={async (id) => {
        const vm = await api.fetchVm(id);
        return { name: vm.planName };
      }}
      openConsole={api.getConsole}
    />
  );
}
