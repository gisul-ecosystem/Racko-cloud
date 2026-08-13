'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGcpRoutes } from '@/lib/cloudPortalRoutes';
import { useGcpProvisionStatus } from '@/cloud_automation_gcp/hooks/useProvisionStatus';

export default function GcpRequestStatusPage() {
  const params = useParams();
  const routes = useGcpRoutes();
  const requestId = String(params?.id || '');
  const { status, loading, error } = useGcpProvisionStatus(requestId, Boolean(requestId));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href={routes.dashboard} className="text-sm text-gray-500 hover:text-gray-800">
        ← Back to GCP dashboard
      </Link>
      <h1 className="text-xl font-bold text-gray-900">GCP request status</h1>
      {loading && !status ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Status</p>
          <p className="text-lg font-semibold text-gray-900">{status.status}</p>
          <p className="mt-2 text-sm text-gray-600">{status.message}</p>
          <p className="mt-1 text-sm text-gray-500">Progress: {status.progress ?? 0}%</p>
          {status.gcpProjectId ? (
            <p className="mt-2 text-sm text-gray-700">GCP project: {status.gcpProjectId}</p>
          ) : null}
          {status.failureReason ? (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{status.failureReason}</p>
          ) : null}
          <ul className="mt-4 space-y-2">
            {(status.steps ?? []).map((step) => (
              <li key={step.key} className="flex justify-between text-sm">
                <span>{step.label}</span>
                <span className="font-medium text-gray-600">{step.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
