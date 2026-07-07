'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface AzureShellContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const AzureShellContext = createContext<AzureShellContextValue | null>(null);

export function AzureShellProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const value = useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [sidebarOpen]
  );

  return <AzureShellContext.Provider value={value}>{children}</AzureShellContext.Provider>;
}

export function useAzureShell() {
  const ctx = useContext(AzureShellContext);
  if (!ctx) throw new Error('useAzureShell must be used within AzureShellProvider');
  return ctx;
}
