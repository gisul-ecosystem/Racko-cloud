'use client';

import { RackoGlobalTopBar } from '../../components/console/RackoGlobalTopBar';
import { CLOUD_AUTOMATION_API_PREFIX } from '../constants';
import { useAzureShell } from '../hooks/useAzureShell';

export function AzureTopBar() {
  const { toggleSidebar } = useAzureShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="Azure Services"
      subtitle="Cloud automation"
      notificationApiBase={CLOUD_AUTOMATION_API_PREFIX}
    />
  );
}
