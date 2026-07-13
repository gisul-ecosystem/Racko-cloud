'use client';

import { useAuth } from '../../../context/AuthContext';
import { useMyVMs } from '../../../hooks/useVMs';
import { VpsOverviewDashboard } from '../../../components/dashboard/VpsOverviewDashboard';

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { vms, loading } = useMyVMs(isAuthenticated);

  if (!user) return null;

  return (
    <VpsOverviewDashboard
      email={user.email}
      loading={loading}
      createHref="/dashboard/admin/vms/create"
      vmsListHref="/dashboard/admin/vms"
      vmDetailHrefPrefix="/dashboard/admin/vms"
      vms={vms.map((vm) => ({
        id: vm._id,
        name: vm.name,
        vmid: vm.vmid,
        status: vm.status,
        node: vm.node,
        allocatedCpu: vm.allocatedCpu,
        allocatedMemoryGb: vm.allocatedMemoryGb,
        allocatedDiskGb: vm.allocatedDiskGb,
        createdAt: vm.createdAt,
      }))}
    />
  );
}
