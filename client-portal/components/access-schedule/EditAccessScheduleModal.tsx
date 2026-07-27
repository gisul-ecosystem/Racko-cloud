'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { WeeklyAccessHoursEditor } from '@/components/access-schedule/WeeklyAccessHoursEditor';
import { ApiError } from '@/lib/apiClient';
import {
  buildWeeklyAccessSchedule,
  createDefaultWeeklyEditorValue,
  type AccessSchedule,
  type AccessScheduleInput,
  type WeeklyAccessEditorValue,
} from '@/lib/accessSchedule';

interface EditAccessScheduleModalProps {
  open: boolean;
  vmName: string;
  initialSchedule?: AccessSchedule | null;
  onClose: () => void;
  onSave: (payload: AccessScheduleInput) => Promise<void>;
}

export function EditAccessScheduleModal({
  open,
  vmName,
  initialSchedule,
  onClose,
  onSave,
}: EditAccessScheduleModalProps) {
  const [value, setValue] = useState<WeeklyAccessEditorValue>(() =>
    createDefaultWeeklyEditorValue(initialSchedule)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(createDefaultWeeklyEditorValue(initialSchedule));
      setError(null);
    }
    // Reset only when the modal opens (or target schedule identity changes via open flip).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid reset while typing
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(buildWeeklyAccessSchedule(value));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Edit access schedule</h3>
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <WeeklyAccessHoursEditor value={value} onChange={setValue} disabled={saving} />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
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
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save schedule
          </button>
        </div>
      </div>
    </div>
  );
}
