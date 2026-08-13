'use client';

import { ExternalVMConsoleView } from '../../../../../../components/console/ExternalVMConsoleView';
import { useVmCatalogPortal } from '../../../../../../context/VmCatalogPortalContext';
import { useSearchParams } from 'next/navigation';

export default function CatalogVmConsolePage() {
  const { routes, api } = useVmCatalogPortal();
  const searchParams = useSearchParams();
  const instanceId = searchParams?.get('instanceId')?.trim() || undefined;

  return (
    <ExternalVMConsoleView
      backHref={routes.myVms}
      disconnectHref={routes.myVms}
      fetchVm={async (id) => {
        const vm = await api.fetchVm(id);
        return { name: vm.planName };
      }}
      openConsole={(id, dimensions) =>
        api.getConsole(id, {
          ...dimensions,
          ...(instanceId ? { instanceId } : {}),
        })
      }
    />
  );
}
