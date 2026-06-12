'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface ConsoleContextValue {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const value = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [searchQuery, sidebarOpen]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsoleShell() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error('useConsoleShell must be used within ConsoleProvider');
  return ctx;
}
