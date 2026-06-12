'use client';

import { useMemo, useState } from 'react';

export function useServiceShell(initialSidebarOpen = true) {
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);

  return useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [sidebarOpen]
  );
}
