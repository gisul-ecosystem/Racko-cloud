'use client';

import { useConsoleShell } from './ConsoleContext';
import { RackoGlobalTopBar } from './RackoGlobalTopBar';

export function ConsoleTopBar() {
  const { searchQuery, setSearchQuery, toggleSidebar } = useConsoleShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="Services console"
      subtitle="All Racko.ai services"
      showSearch
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />
  );
}
