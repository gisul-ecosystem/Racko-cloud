'use client';

import { useParams } from 'next/navigation';
import { VMConsoleView } from '../../../../../../components/console/VMConsoleView';

export default function AdminVMConsolePage() {
  const { vmId } = useParams<{ vmId: string }>();
  return (
    <VMConsoleView
      backHref={`/dashboard/admin/vms/${vmId}`}
      disconnectHref="/dashboard/admin/vms"
    />
  );
}
