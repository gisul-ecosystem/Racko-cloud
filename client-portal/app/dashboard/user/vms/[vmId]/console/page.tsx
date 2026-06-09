'use client';

import { useParams } from 'next/navigation';
import { VMConsoleView } from '../../../../admin/vms/[vmId]/console/page';

export default function UserVMConsolePage() {
  const { vmId } = useParams<{ vmId: string }>();
  return (
    <VMConsoleView
      backHref={`/dashboard/user/vms/${vmId}`}
      disconnectHref="/dashboard/user"
    />
  );
}
