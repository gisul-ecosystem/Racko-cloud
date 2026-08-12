'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Settings2,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  clientSchedulesOverlap,
  deleteSuperAdminExternalVmAssignment,
  patchSuperAdminExternalVmAssignment,
  type AssignmentScheduleDto,
  type SuperAdminExternalVmAssigneeView,
  type SuperAdminExternalVmOverviewRow,
  updateSuperAdminExternalVmProviderMetadata,
} from '@/lib/superAdminExternalVmApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

const DAY_LABELS = [
  { d: 0, label: 'Sun' },
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
];

interface ScheduleEditorState {
  useSchedule: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  daysOfWeek: number[];
  dailyStart: string;
  dailyEnd: string;
  timezone: string;
}

function defaultScheduleEditor(): ScheduleEditorState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    useSchedule: false,
    effectiveFrom: today,
    effectiveTo: '',
    daysOfWeek: [1, 2, 3, 4, 5],
    dailyStart: '09:00',
    dailyEnd: '18:00',
    timezone: 'Asia/Kolkata',
  };
}

function scheduleFromDto(dto: AssignmentScheduleDto | null): ScheduleEditorState {
  const base = defaultScheduleEditor();
  if (!dto) return base;
  return {
    useSchedule: true,
    effectiveFrom: dto.effectiveFrom.slice(0, 10),
    effectiveTo: dto.effectiveTo ? dto.effectiveTo.slice(0, 10) : '',
    daysOfWeek: dto.daysOfWeek?.length ? dto.daysOfWeek : base.daysOfWeek,
    dailyStart: dto.dailyStart,
    dailyEnd: dto.dailyEnd,
    timezone: dto.timezone || 'Asia/Kolkata',
  };
}

function toScheduleDto(state: ScheduleEditorState): AssignmentScheduleDto | null {
  if (!state.useSchedule) return null;
  return {
    effectiveFrom: new Date(`${state.effectiveFrom}T00:00:00.000Z`).toISOString(),
    effectiveTo: state.effectiveTo
      ? new Date(`${state.effectiveTo}T23:59:59.999Z`).toISOString()
      : null,
    daysOfWeek: state.daysOfWeek,
    dailyStart: state.dailyStart,
    dailyEnd: state.dailyEnd,
    timezone: state.timezone.trim() || 'Asia/Kolkata',
  };
}

function assigneeLabel(a: SuperAdminExternalVmAssigneeView): string {
  if (a.email) return a.username ? `${a.email} (@${a.username})` : a.email;
  return a.userId ?? a.tenantUserId ?? 'Unknown';
}

function isManageableAssignment(a: SuperAdminExternalVmAssigneeView): boolean {
  return !a.assignmentId.startsWith('legacy:') && a.assignmentId !== 'none';
}

function SchedulePicker({
  value,
  onChange,
}: {
  value: ScheduleEditorState;
  onChange: (next: ScheduleEditorState) => void;
}) {
  const toggleDay = (d: number) => {
    const has = value.daysOfWeek.includes(d);
    onChange({
      ...value,
      daysOfWeek: has
        ? value.daysOfWeek.filter((x) => x !== d)
        : [...value.daysOfWeek, d].sort((a, b) => a - b),
    });
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Effective from</label>
          <input
            type="date"
            className={inputClass}
            value={value.effectiveFrom}
            onChange={(e) => onChange({ ...value, effectiveFrom: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Effective to (optional)</label>
          <input
            type="date"
            className={inputClass}
            value={value.effectiveTo}
            onChange={(e) => onChange({ ...value, effectiveTo: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Daily start</label>
          <input
            type="time"
            className={inputClass}
            value={value.dailyStart}
            onChange={(e) => onChange({ ...value, dailyStart: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Daily end</label>
          <input
            type="time"
            className={inputClass}
            value={value.dailyEnd}
            onChange={(e) => onChange({ ...value, dailyEnd: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Days of week</label>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map(({ d, label }) => {
            const on = value.daysOfWeek.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  on
                    ? 'bg-[#B91C1C] text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className={labelClass}>Timezone</label>
        <input
          className={inputClass}
          value={value.timezone}
          onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          placeholder="Asia/Kolkata"
        />
      </div>
    </div>
  );
}

function overlapWarningsForAssignments(
  items: Array<{ key: string; label: string; schedule: AssignmentScheduleDto | null }>
): string[] {
  const withSched = items.filter((x) => x.schedule);
  const warnings: string[] = [];
  for (let i = 0; i < withSched.length; i++) {
    for (let j = i + 1; j < withSched.length; j++) {
      const left = withSched[i]!;
      const right = withSched[j]!;
      if (clientSchedulesOverlap(left.schedule!, right.schedule!)) {
        warnings.push(`${left.label} overlaps with ${right.label}`);
      }
    }
  }
  return warnings;
}

interface ProviderEditorState {
  providerStartDate: string;
  providerEndDate: string;
}

function providerEditorFromRow(row: SuperAdminExternalVmOverviewRow): ProviderEditorState {
  return {
    providerStartDate: row.providerStartDate ? row.providerStartDate.slice(0, 10) : '',
    providerEndDate: row.providerEndDate ? row.providerEndDate.slice(0, 10) : '',
  };
}

export function ManageExternalVmAssignmentsModal({
  row,
  onClose,
  onUpdated,
}: {
  row: SuperAdminExternalVmOverviewRow;
  onClose: () => void;
  onUpdated: (row: SuperAdminExternalVmOverviewRow) => void;
}) {
  const [localRow, setLocalRow] = useState(row);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState(defaultScheduleEditor);
  const [providerEditor, setProviderEditor] = useState<ProviderEditorState>(() => providerEditorFromRow(row));
  const [savingProvider, setSavingProvider] = useState(false);

  useEffect(() => {
    setLocalRow(row);
    setProviderEditor(providerEditorFromRow(row));
  }, [row]);

  const manageable = localRow.assignments.filter(isManageableAssignment);
  const legacy = localRow.assignments.filter((a) => a.assignmentId.startsWith('legacy:'));

  const previewSchedules = useMemo(() => {
    const items: Array<{ key: string; label: string; schedule: AssignmentScheduleDto | null }> =
      manageable
        .filter((a) => a.status === 'active')
        .map((a) => ({
          key: a.assignmentId,
          label: assigneeLabel(a),
          schedule:
            editingId === a.assignmentId
              ? toScheduleDto(editSchedule)
              : a.schedule,
        }));
    return items;
  }, [
    manageable,
    editingId,
    editSchedule,
  ]);

  const overlapWarnings = useMemo(
    () => overlapWarningsForAssignments(previewSchedules),
    [previewSchedules]
  );

  function applyRow(next: SuperAdminExternalVmOverviewRow) {
    setLocalRow(next);
    onUpdated(next);
  }

  function startEdit(a: SuperAdminExternalVmAssigneeView) {
    setEditingId(a.assignmentId);
    setEditSchedule(scheduleFromDto(a.schedule));
    setError(null);
  }

  async function saveProviderMetadata() {
    setSavingProvider(true);
    setError(null);
    try {
      const updated = await updateSuperAdminExternalVmProviderMetadata({
        ipAddress: localRow.ipAddress,
        providerStartDate: providerEditor.providerStartDate
          ? new Date(`${providerEditor.providerStartDate}T00:00:00.000Z`).toISOString()
          : null,
        providerEndDate: providerEditor.providerEndDate
          ? new Date(`${providerEditor.providerEndDate}T00:00:00.000Z`).toISOString()
          : null,
      });

      if (!updated.updated) {
        throw new Error('Provider metadata was not updated.');
      }

      const nextRow = {
        ...localRow,
        providerStartDate: providerEditor.providerStartDate
          ? new Date(`${providerEditor.providerStartDate}T00:00:00.000Z`).toISOString()
          : null,
        providerEndDate: providerEditor.providerEndDate
          ? new Date(`${providerEditor.providerEndDate}T00:00:00.000Z`).toISOString()
          : null,
      };
      applyRow(nextRow);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to update provider metadata.');
    } finally {
      setSavingProvider(false);
    }
  }

  async function saveEdit(assignmentId: string) {
    const schedule = toScheduleDto(editSchedule);
    if (editSchedule.useSchedule && !schedule) {
      setError('Complete the schedule fields or use always-on.');
      return;
    }
    setBusyId(assignmentId);
    setError(null);
    try {
      const updated = await patchSuperAdminExternalVmAssignment(
        localRow.externalVmId,
        assignmentId,
        { schedule }
      );
      applyRow(updated);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update assignment.');
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(assignmentId: string) {
    setBusyId(assignmentId);
    setError(null);
    try {
      const updated = await patchSuperAdminExternalVmAssignment(
        localRow.externalVmId,
        assignmentId,
        { status: 'revoked' }
      );
      applyRow(updated);
      if (editingId === assignmentId) setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke assignment.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(assignmentId: string) {
    setBusyId(assignmentId);
    setError(null);
    try {
      const updated = await deleteSuperAdminExternalVmAssignment(
        localRow.externalVmId,
        assignmentId
      );
      applyRow(updated);
      if (editingId === assignmentId) setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove assignment.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[#B91C1C]">
              <Settings2 className="h-5 w-5" />
              <h2 className="text-base font-semibold text-gray-900">Manage assignments</h2>
            </div>
            <p className="mt-1 text-sm font-medium text-gray-900">{localRow.name}</p>
            <p className="font-mono text-xs text-gray-500">{localRow.ipAddress}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {overlapWarnings.length > 0 && (
            <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <ul className="list-inside list-disc space-y-0.5">
                {overlapWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Provider details</h3>
                <p className="text-xs text-gray-500">Edit provider start and end dates for this VM.</p>
              </div>
              <button
                type="button"
                disabled={savingProvider}
                onClick={() => void saveProviderMetadata()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {savingProvider && <Loader2 className="h-4 w-4 animate-spin" />}
                Save provider dates
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Provider start date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={providerEditor.providerStartDate}
                  onChange={(e) => setProviderEditor((current) => ({ ...current, providerStartDate: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Provider end date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={providerEditor.providerEndDate}
                  onChange={(e) => setProviderEditor((current) => ({ ...current, providerEndDate: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Current assignees
            </h3>
            {manageable.length === 0 && legacy.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                No assignments yet
              </p>
            ) : (
              manageable.map((a) => (
                <div
                  key={a.assignmentId}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{assigneeLabel(a)}</p>
                      <p className="text-xs capitalize text-gray-500">Status: {a.status}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {a.status === 'active' && (
                        <button
                          type="button"
                          disabled={busyId === a.assignmentId}
                          onClick={() =>
                            editingId === a.assignmentId
                              ? setEditingId(null)
                              : startEdit(a)
                          }
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {editingId === a.assignmentId ? 'Cancel' : 'Edit schedule'}
                        </button>
                      )}
                      {a.status === 'active' && (
                        <button
                          type="button"
                          disabled={busyId === a.assignmentId}
                          onClick={() => void revoke(a.assignmentId)}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {busyId === a.assignmentId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Revoke'
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === a.assignmentId}
                        onClick={() => void remove(a.assignmentId)}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {editingId === a.assignmentId ? (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={!editSchedule.useSchedule}
                          onChange={(e) =>
                            setEditSchedule((s) => ({
                              ...s,
                              useSchedule: !e.target.checked,
                            }))
                          }
                        />
                        Always on (no schedule restriction)
                      </label>
                      {editSchedule.useSchedule && (
                        <SchedulePicker value={editSchedule} onChange={setEditSchedule} />
                      )}
                      <button
                        type="button"
                        disabled={busyId === a.assignmentId}
                        onClick={() => void saveEdit(a.assignmentId)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === a.assignmentId && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Save schedule
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-600">
                      {a.schedule
                        ? `${a.schedule.effectiveFrom.slice(0, 10)} · ${a.schedule.dailyStart}–${a.schedule.dailyEnd}`
                        : 'Always on'}
                    </p>
                  )}
                </div>
              ))
            )}

            {legacy.map((a) => (
              <div
                key={a.assignmentId}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3 opacity-80"
              >
                <p className="text-sm text-gray-800">{assigneeLabel(a)}</p>
                <p className="text-xs text-gray-500">Legacy assignment</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
