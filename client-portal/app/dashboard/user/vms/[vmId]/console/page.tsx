'use client';

import { useParams } from 'next/navigation';
import { VMConsoleView } from '../../../../../../components/console/VMConsoleView';

export default function UserVMConsolePage() {
  const { vmId } = useParams<{ vmId: string }>();
  return (
    <VMConsoleView
      backHref={`/dashboard/user/vms/${vmId}`}
      disconnectHref="/dashboard/user"
    />
  );
}
