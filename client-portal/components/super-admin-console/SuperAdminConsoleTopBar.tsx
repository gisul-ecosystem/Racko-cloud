'use client';

import { RackoGlobalTopBar } from '../console/RackoGlobalTopBar';

interface SuperAdminConsoleTopBarProps {
  onToggleSidebar: () => void;
}

export function SuperAdminConsoleTopBar({ onToggleSidebar }: SuperAdminConsoleTopBarProps) {
  return (
    <RackoGlobalTopBar
      onToggleSidebar={onToggleSidebar}
      title="Super Admin Console"
      subtitle="Infrastructure & cloud services"
    />
  );
}
