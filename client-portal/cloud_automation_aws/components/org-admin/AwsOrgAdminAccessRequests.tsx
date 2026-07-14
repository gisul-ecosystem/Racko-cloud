'use client';

import { useState } from 'react';
import { Check, Loader2, ShieldAlert, X } from 'lucide-react';
import type { AwsOrgAdminAccessRequest } from '../../types/orgAdmin';

interface Props {
  requests: AwsOrgAdminAccessRequest[];
  loading: boolean;
  saving: boolean;
  onReview: (
    id: string,
    status: 'approved' | 'rejected',
    reviewNotes?: string
  ) => Promise<boolean>;
}

export function AwsOrgAdminAccessRequests({ requests, loading, saving, onReview }: Props) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (loading && requests.length === 0) {
    return <div className="h-24 animate-pulse rounded-xl border bg-gray-50" />;
  }
  if (requests.length === 0) return null;

  async function review(id: string, status: 'approved' | 'rejected') {
    setReviewingId(id);
    try {
      await onReview(id, status, notes[id]?.trim() || undefined);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50">
      <header className="flex items-center gap-2 border-b border-amber-100 px-5 py-3">
        <ShieldAlert className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-amber-900">
          Pending AWS access requests ({requests.length})
        </h2>
      </header>
      <ul className="divide-y divide-amber-100">
        {requests.map((request) => {
          const busy = saving && reviewingId === request.id;
          return (
            <li key={request.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {request.serviceName} · {request.customerEmail}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Request #{request.requestId ?? '—'} · {request.requestedAccess}
                    {request.region ? ` · ${request.region}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Submitted {new Date(request.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(request.id, 'approved')}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(request.id, 'rejected')}
                    className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
              <input
                value={notes[request.id] ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                }
                placeholder="Optional review notes"
                className="mt-3 w-full rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
