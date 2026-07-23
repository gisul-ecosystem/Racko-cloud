'use client';

import { useState } from 'react';
import { Check, Loader2, Shield, X } from 'lucide-react';
import { formatDateTime } from '../../utils/formatters';
import type { OrgAdminPrivilegedRoleRequest } from '../../types/orgAdmin';

interface OrgAdminPrivilegedRoleRequestsProps {
  requests: OrgAdminPrivilegedRoleRequest[];
  loading: boolean;
  saving: boolean;
  onReview: (
    id: number,
    status: 'approved' | 'rejected',
    reviewNotes?: string
  ) => Promise<boolean>;
}

export function OrgAdminPrivilegedRoleRequests({
  requests,
  loading,
  saving,
  onReview,
}: OrgAdminPrivilegedRoleRequestsProps) {
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function handleReview(id: number, status: 'approved' | 'rejected') {
    setReviewingId(id);
    try {
      await onReview(id, status, notes[id]?.trim() || undefined);
    } finally {
      setReviewingId(null);
    }
  }

  if (loading && requests.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 shadow-sm">
      <div className="flex items-center gap-2 border-b border-violet-100 px-5 py-3">
        <Shield className="h-4 w-4 text-violet-700" />
        <h2 className="text-sm font-semibold text-violet-900">
          Pending privileged role requests ({requests.length})
        </h2>
      </div>

      <ul className="divide-y divide-violet-100">
        {requests.map((request) => {
          const busy = saving && reviewingId === request.id;

          return (
            <li key={request.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {request.azureRole} · {request.customerEmail}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Lab #{request.requestId ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Submitted {formatDateTime(request.createdAt)}
                    {request.resourceGroup && ` · RG: ${request.resourceGroup}`}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleReview(request.id, 'approved')}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleReview(request.id, 'rejected')}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={notes[request.id] ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                }
                placeholder="Optional review notes"
                className="mt-3 w-full rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs text-gray-900 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
