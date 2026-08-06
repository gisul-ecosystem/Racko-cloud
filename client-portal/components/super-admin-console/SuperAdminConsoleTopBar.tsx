'use client';

import { useState } from 'react';
import { RackoGlobalTopBar } from '../console/RackoGlobalTopBar';

interface SuperAdminConsoleTopBarProps {
  onToggleSidebar: () => void;
}

export function SuperAdminConsoleTopBar({ onToggleSidebar }: SuperAdminConsoleTopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <RackoGlobalTopBar
      onToggleSidebar={onToggleSidebar}
      title="Super Admin Console"
      subtitle="Infrastructure & cloud services"
      showSearch
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search...."
    />
  );
}
