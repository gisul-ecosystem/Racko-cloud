'use client';

import { createContext, useContext } from 'react';
import {
  adminVmCatalogPortalConfig,
  type VmCatalogPortalConfig,
} from '@/lib/vmCatalogPortalConfig';

interface VmCatalogPortalContextValue extends VmCatalogPortalConfig {
  isReady: boolean;
}

const VmCatalogPortalContext = createContext<VmCatalogPortalContextValue>({
  ...adminVmCatalogPortalConfig,
  isReady: false,
});

export function VmCatalogPortalProvider({
  config,
  isReady,
  children,
}: {
  config: VmCatalogPortalConfig;
  isReady: boolean;
  children: React.ReactNode;
}) {
  return (
    <VmCatalogPortalContext.Provider value={{ ...config, isReady }}>
      {children}
    </VmCatalogPortalContext.Provider>
  );
}

export function useVmCatalogPortal(): VmCatalogPortalContextValue {
  return useContext(VmCatalogPortalContext);
}
