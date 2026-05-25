'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useClusterData } from '../../../hooks/useClusterData';
import { ClusterOverviewCards } from '../../../components/dashboard/ClusterOverviewCards';
import { NodesTable } from '../../../components/dashboard/NodesTable';
import { VMsTable } from '../../../components/dashboard/VMsTable';
import { StorageTable } from '../../../components/dashboard/StorageTable';
import { DashboardSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { LastUpdated } from '../../../components/dashboard/LastUpdated';
import Link from 'next/link';
import { Bell, AlertTriangle, XCircle, ChevronRight } from 'lucide-react';
import { fetchActiveAlerts, type NodeAlert } from '../../../lib/vmApi';

function AlertsSummary() {
  const [alerts, setAlerts] = useState<NodeAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveAlerts()
      .then(setAlerts)
      .catch(() => {/* best-effort */})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-pulse">
        <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
        <div className="h-5 w-12 bg-gray-200 rounded" />
      </div>
    );
  }

  const critical = alerts.filter((a) => a.severity === 'critical' || a.severity === 'full');
  const warnings = alerts.filter((a) => a.severity === 'warning');

  if (alerts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-green-700">All nodes healthy — no active alerts</span>
        </div>
        <Link href="/dashboard/super-admin/alerts" className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
          View alerts <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className={`border rounded-xl p-4 shadow-sm ${critical.length > 0 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {critical.length > 0
            ? <XCircle className="w-4 h-4 text-red-500" />
            : <AlertTriangle className="w-4 h-4 text-yellow-500" />
          }
          <span className={`text-sm font-semibold ${critical.length > 0 ? 'text-red-700' : 'text-yellow-700'}`}>
            {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Link href="/dashboard/super-admin/alerts" className={`text-xs font-medium flex items-center gap-1 ${critical.length > 0 ? 'text-red-600 hover:text-red-700' : 'text-yellow-600 hover:text-yellow-700'}`}>
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-1.5">
        {[...critical, ...warnings].slice(0, 3).map((alert) => (
          <div key={alert._id} className="flex items-center justify-between text-xs">
            <span className={`font-medium ${alert.severity === 'full' || alert.severity === 'critical' ? 'text-red-700' : 'text-yellow-700'}`}>
              {alert.node} — {alert.resource.toUpperCase()}
            </span>
            <span className={alert.severity === 'full' || alert.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'}>
              {alert.currentPercent.toFixed(1)}% ({alert.severity})
            </span>
          </div>
        ))}
        {alerts.length > 3 && (
          <p className="text-xs text-gray-500 mt-1">+{alerts.length - 3} more alerts</p>
        )}
      </div>
    </div>
  );
}

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
          <Link
            href="/dashboard/super-admin/alerts"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition shadow-sm"
          >
            <Bell className="w-3.5 h-3.5" />
            Alerts
          </Link>
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
            <AlertsSummary />
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
