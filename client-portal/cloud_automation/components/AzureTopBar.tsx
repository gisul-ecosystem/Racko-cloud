'use client';

import { RackoGlobalTopBar } from '../../components/console/RackoGlobalTopBar';
import { useAzureShell } from '../hooks/useAzureShell';

export function AzureTopBar() {
  const { toggleSidebar } = useAzureShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="Azure Services"
      subtitle="Cloud automation"
    />
  );
}
