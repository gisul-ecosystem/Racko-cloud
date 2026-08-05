'use client';

import { RackoGlobalTopBar } from '../../components/console/RackoGlobalTopBar';
import { CLOUD_AUTOMATION_API_PREFIX } from '../../cloud_automation/constants';
import { useAzureShell } from '../../cloud_automation/hooks/useAzureShell';
import { AZURE_LABS_SERVICE, CLOUD_LABS_SERVICE } from '../constants';

export function AzureLabsTopBar() {
  const { toggleSidebar } = useAzureShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title={AZURE_LABS_SERVICE.name}
      subtitle={CLOUD_LABS_SERVICE.name}
      notificationApiBase={CLOUD_AUTOMATION_API_PREFIX}
    />
  );
}
