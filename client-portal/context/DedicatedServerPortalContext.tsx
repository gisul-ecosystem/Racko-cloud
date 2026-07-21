'use client';

import { createContext, useContext } from 'react';
import {
  adminDedicatedServerPortalConfig,
  type DedicatedServerPortalConfig,
} from '@/lib/dedicatedServerPortalConfig';

interface DedicatedServerPortalContextValue extends DedicatedServerPortalConfig {
  isReady: boolean;
}

const DedicatedServerPortalContext = createContext<DedicatedServerPortalContextValue>({
  ...adminDedicatedServerPortalConfig,
  isReady: false,
});

export function DedicatedServerPortalProvider({
  config,
  isReady,
  children,
}: {
  config: DedicatedServerPortalConfig;
  isReady: boolean;
  children: React.ReactNode;
}) {
  return (
    <DedicatedServerPortalContext.Provider value={{ ...config, isReady }}>
      {children}
    </DedicatedServerPortalContext.Provider>
  );
}

export function useDedicatedServerPortal(): DedicatedServerPortalContextValue {
  return useContext(DedicatedServerPortalContext);
}
