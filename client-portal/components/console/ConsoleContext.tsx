'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface ConsoleContextValue {
  searchQuery: string;        // raw value bound to input
  debouncedQuery: string;     // debounced — used for filtering
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

const DEBOUNCE_MS = 200;

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchQuery]);

  const value = useMemo(
    () => ({
      searchQuery,
      debouncedQuery,
      setSearchQuery,
      isSearchOpen,
      setSearchOpen,
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [searchQuery, debouncedQuery, isSearchOpen, sidebarOpen]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsoleShell() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error('useConsoleShell must be used within ConsoleProvider');
  return ctx;
}
