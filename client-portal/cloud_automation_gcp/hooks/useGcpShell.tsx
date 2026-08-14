'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface GcpShellContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const GcpShellContext = createContext<GcpShellContextValue | null>(null);

export function GcpShellProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const value = useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [sidebarOpen]
  );

  return <GcpShellContext.Provider value={value}>{children}</GcpShellContext.Provider>;
}

export function useGcpShell() {
  const ctx = useContext(GcpShellContext);
  if (!ctx) throw new Error('useGcpShell must be used within GcpShellProvider');
  return ctx;
}
