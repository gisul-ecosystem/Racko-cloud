'use client';

import { useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { adminDeleteOrganization } from '@/lib/customerOnboardingApi';

type Props = {
  open: boolean;
  user: { id: string; email: string } | null;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteOrganizationModal({ open, user, onClose, onDeleted }: Props) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !user) return null;

  const confirmed = confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase();

  function handleClose() {
    if (submitting) return;
    setConfirmEmail('');
    setError(null);
    onClose();
  }

  async function handleDelete() {
    if (!user || !confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await adminDeleteOrganization(user.id);
      setConfirmEmail('');
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete organization account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600" />
            <h2 className="text-base font-semibold text-gray-900">Delete organization account</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-gray-600">
            Permanently delete{' '}
            <span className="font-medium text-gray-900">{user.email}</span>? This removes the
            organization admin account and related platform records (org details, wallet, services,
            team users, projects, sessions).
          </p>
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
            This cannot be undone. Cloud lab resources in Azure/AWS (if any) are not automatically
            cleaned up from the provider.
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Type <span className="font-semibold">{user.email}</span> to confirm
            </label>
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none disabled:opacity-50"
              placeholder={user.email}
              autoComplete="off"
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={submitting || !confirmed}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete forever
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
