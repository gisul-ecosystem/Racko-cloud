'use client';

import { RackoGlobalTopBar } from '../../components/console/RackoGlobalTopBar';
import { useAwsShell } from '../hooks/useAwsShell';

export function AwsTopBar() {
  const { toggleSidebar } = useAwsShell();

  return (
    <RackoGlobalTopBar
      onToggleSidebar={toggleSidebar}
      title="AWS Services"
      subtitle="Cloud automation"
    />
  );
}
