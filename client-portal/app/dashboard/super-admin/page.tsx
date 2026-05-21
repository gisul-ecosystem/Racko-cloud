'use client';

import { useAuth } from '../../../context/AuthContext';
import { useClusterData } from '../../../hooks/useClusterData';
import { ClusterOverviewCards } from '../../../components/dashboard/ClusterOverviewCards';
import { NodesTable } from '../../../components/dashboard/NodesTable';
import { VMsTable } from '../../../components/dashboard/VMsTable';
import { StorageTable } from '../../../components/dashboard/StorageTable';
import { DashboardSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { LastUpdated } from '../../../components/dashboard/LastUpdated';

export default function SuperAdminDashboard() {
  const { user, logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, loading, error, refetch } = useClusterData(isAuthenticated, authLoading);

  if (!user) return null;

  return (
    <div className="max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Infrastructure Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Real-time Proxmox cluster monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-gray-700">{user.email}</p>
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
              Super Admin
            </span>
          </div>
          <button
            onClick={logout}
            className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition border border-gray-200 shadow-sm"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Last updated bar */}
      {data && (
        <LastUpdated
          fetchedAt={data.fetchedAt}
          loading={loading}
          onRefresh={refetch}
        />
      )}

      {/* Content */}
      <div className="mt-4 space-y-6">
        {loading && !data && <DashboardSkeleton />}

        {error && !data && (
          <ErrorState message={error} onRetry={refetch} />
        )}

        {data && (
          <>
            <ClusterOverviewCards overview={data.cluster} />
            <NodesTable nodes={data.nodes} />
            <VMsTable vms={data.vms} />
            <StorageTable storage={data.storage} />
          </>
        )}
      </div>
    </div>
  );
}
