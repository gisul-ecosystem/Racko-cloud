'use client';

import { RackoGlobalTopBar } from '../../components/console/RackoGlobalTopBar';
import { AWS_API_BASE } from '../constants';
import { useAwsShell } from '../hooks/useAwsShell';

export function AwsTopBar() {
  const { toggleSidebar } = useAwsShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="AWS Services"
      subtitle="Cloud automation"
      notificationApiBase={AWS_API_BASE}
    />
  );
}
