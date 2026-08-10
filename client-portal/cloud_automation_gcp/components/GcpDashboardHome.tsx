'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Globe, Plus, RefreshCw } from 'lucide-react';
import { useOptionalAuth } from '../../context/AuthContext';
import { useGcpRoutes } from '../../lib/cloudPortalRoutes';
import { useCloudAccentColor } from '../../lib/cloudAccent';
import { hexToRgba, tenantAccentButton } from '../../lib/tenantAccentStyles';
import { GCP_SERVICE } from '../constants';
import { useGcpRequests } from '../hooks/useGcpRequests';

export function GcpDashboardHome() {
  const auth = useOptionalAuth();
  const routes = useGcpRoutes();
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);
  const searchParams = useSearchParams();
  const filterProjectId = searchParams?.get('projectId')?.trim() || null;
  const { requests, stats, loading, error, refetch } = useGcpRequests(Boolean(auth?.user));

  return (
    <div className="mx-auto w-full max-w-screen-xl space-y-6 p-6">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl"
              style={{ backgroundColor: soft, color: accent }}
            >
              <Globe className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{GCP_SERVICE.name}</h1>
              <p className="mt-1 text-sm text-gray-500">{GCP_SERVICE.description}</p>
              {filterProjectId ? (
                <p className="mt-2 text-xs text-gray-400">Project filter: {filterProjectId}</p>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              href={
                filterProjectId
                  ? `${routes.createRequest}?projectId=${encodeURIComponent(filterProjectId)}`
                  : routes.createRequest
              }
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={tenantAccentButton(accent)}
            >
              <Plus className="h-4 w-4" />
              Create Request
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Total Requests', stats.total],
          ['Completed', stats.completed],
          ['Provisioning', stats.provisioning],
          ['Failed / Expired', stats.expired],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="mt-1 text-sm text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent requests</h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading requests…</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No GCP lab requests yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.slice(0, 10).map((request) => (
              <Link
                key={request._id}
                href={routes.requestStatus(request._id)}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {request.projectName || request.project_name || 'Lab request'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {request.customerEmail || request.customer_email} · {request.region}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-600">{request.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
