'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface AwsShellContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const AwsShellContext = createContext<AwsShellContextValue | null>(null);

export function AwsShellProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const value = useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [sidebarOpen]
  );

  return <AwsShellContext.Provider value={value}>{children}</AwsShellContext.Provider>;
}

export function useAwsShell() {
  const ctx = useContext(AwsShellContext);
  if (!ctx) throw new Error('useAwsShell must be used within AwsShellProvider');
  return ctx;
}
