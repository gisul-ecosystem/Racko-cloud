'use client';

import { useConsoleShell } from './ConsoleContext';
import { RackoGlobalTopBar } from './RackoGlobalTopBar';
import { ConsoleSearchDropdown } from './ConsoleSearchDropdown';

export function ConsoleTopBar() {
  const { searchQuery, setSearchQuery, isSearchOpen, setSearchOpen, toggleSidebar } = useConsoleShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="Services console"
      subtitle="All Racko.ai services"
      showSearch
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isSearchOpen={isSearchOpen}
      onSearchOpen={setSearchOpen}
      searchDropdown={<ConsoleSearchDropdown />}
    />
  );
}
