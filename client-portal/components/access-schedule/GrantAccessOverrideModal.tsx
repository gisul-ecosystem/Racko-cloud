'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  DEFAULT_ACCESS_TIMEZONE,
  formatDatetimeLocalWithOffset,
} from '@/lib/accessSchedule';

export interface AccessOverridePayload {
  accessOverride: boolean;
  accessOverrideUntil?: string | null;
}

interface GrantAccessOverrideModalProps {
  open: boolean;
  vmName: string;
  currentlyActive?: boolean;
  onClose: () => void;
  onSave: (payload: AccessOverridePayload) => Promise<void>;
}

type Mode = 'permanent' | 'until';

export function GrantAccessOverrideModal({
  open,
  vmName,
  currentlyActive = false,
  onClose,
  onSave,
}: GrantAccessOverrideModalProps) {
  const [mode, setMode] = useState<Mode>('until');
  const [untilLocal, setUntilLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function grant() {
    setSaving(true);
    setError(null);
    try {
      if (mode === 'permanent') {
        await onSave({ accessOverride: true });
      } else {
        if (!untilLocal) {
          setError('Choose an until date and time.');
          setSaving(false);
          return;
        }
        await onSave({
          accessOverride: true,
          accessOverrideUntil: formatDatetimeLocalWithOffset(
            untilLocal,
            DEFAULT_ACCESS_TIMEZONE
          ),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to grant override.');
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ accessOverride: false });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke override.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Access override</h3>
            <p className="mt-0.5 text-sm text-gray-500">{vmName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <p className="mb-4 text-sm text-gray-600">
          Temporarily bypass the weekly schedule for this resource. Superadmin only.
        </p>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              checked={mode === 'permanent'}
              onChange={() => setMode('permanent')}
              disabled={saving}
            />
            Permanent override
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
            <input
              type="radio"
              className="mt-1"
              checked={mode === 'until'}
              onChange={() => setMode('until')}
              disabled={saving}
            />
            <span className="flex-1">
              Until
              <input
                type="datetime-local"
                value={untilLocal}
                disabled={saving || mode !== 'until'}
                onChange={(e) => setUntilLocal(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-40"
              />
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {currentlyActive ? (
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Revoke
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void grant()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Grant override
          </button>
        </div>
      </div>
    </div>
  );
}
