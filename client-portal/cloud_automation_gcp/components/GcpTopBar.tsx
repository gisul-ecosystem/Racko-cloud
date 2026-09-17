'use client';

import { RackoGlobalTopBar } from '../../components/console/RackoGlobalTopBar';
import { GCP_API_BASE } from '../constants';
import { useGcpShell } from '../hooks/useGcpShell';

export function GcpTopBar() {
  const { toggleSidebar } = useGcpShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="GCP Services"
      subtitle="Cloud automation"
      notificationApiBase={GCP_API_BASE}
    />
  );
}
