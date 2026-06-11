'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import {
  fetchMyVMs,
  fetchVmAutomations,
  createVmAutomation,
  updateVmAutomation,
  deleteVmAutomation,
  type IVM,
  type VmAutomation,
} from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import {
  Clock,
  Server,
  CheckSquare,
  Square,
  Loader2,
  Trash2,
  Power,
  Moon,
  Plus,
  AlertCircle,
} from 'lucide-react';

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
];

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function AutomationPage() {
  const { isAuthenticated } = useAuth();

  const [vms, setVms] = useState<IVM[]>([]);
  const [automations, setAutomations] = useState<VmAutomation[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [selectedVmIds, setSelectedVmIds] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState('05:00');
  const [stopTime, setStopTime] = useState('09:00');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    setInitialLoading(true);
    setError(null);

    void Promise.all([fetchMyVMs(), fetchVmAutomations()])
      .then(([vmList, automationList]) => {
        if (cancelled) return;
        setVms(vmList);
        setAutomations(automationList);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load automation data.');
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  function toggleVm(vmId: string) {
    setSelectedVmIds((prev) => {
      const next = new Set(prev);
      if (next.has(vmId)) next.delete(vmId);
      else next.add(vmId);
      return next;
    });
  }

  function toggleAllVms() {
    if (selectedVmIds.size === vms.length) {
      setSelectedVmIds(new Set());
    } else {
      setSelectedVmIds(new Set(vms.map((v) => v._id)));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Enter a name for this automation.');
      return;
    }
    if (selectedVmIds.size === 0) {
      setFormError('Select at least one VM.');
      return;
    }
    if (!startDate || !endDate) {
      setFormError('Select start and end dates.');
      return;
    }
    if (startDate > endDate) {
      setFormError('End date must be on or after start date.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createVmAutomation({
        name: name.trim(),
        vmIds: Array.from(selectedVmIds),
        startTime,
        stopTime,
        startDate,
        endDate,
        timezone,
      });
      setAutomations((prev) => [created, ...prev]);
      setName('');
      setSelectedVmIds(new Set());
      setError(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create automation.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(automation: VmAutomation) {
    setActionId(automation._id);
    setError(null);
    try {
      const updated = await updateVmAutomation(automation._id, { isActive: !automation.isActive });
      setAutomations((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update automation.');
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(automationId: string) {
    if (!confirm('Delete this automation? Scheduled hibernate/resume will stop.')) return;
    setActionId(automationId);
    setError(null);
    try {
      await deleteVmAutomation(automationId);
      setAutomations((prev) => prev.filter((a) => a._id !== automationId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete automation.');
    } finally {
      setActionId(null);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-blue-600" />
          Automation
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Schedule VMs to <strong>resume</strong> at start time and <strong>hibernate</strong> at stop time.
          Hibernate saves open apps and tabs; no CPU/RAM is used while hibernated.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Existing automations */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Active schedules</h2>
        {automations.length === 0 ? (
          <p className="text-sm text-gray-500">No automations yet. Create one below.</p>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <div
                key={a._id}
                className="flex flex-wrap items-center gap-3 border border-gray-100 rounded-lg px-4 py-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.vmCount} VM{a.vmCount !== 1 ? 's' : ''} ·{' '}
                    <span className="inline-flex items-center gap-1">
                      <Power className="w-3 h-3" />
                      {a.startTime}
                    </span>
                    {' → '}
                    <span className="inline-flex items-center gap-1">
                      <Moon className="w-3 h-3" />
                      {a.stopTime}
                    </span>
                    {' · '}
                    {a.startDate} – {a.endDate} ({a.timezone})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleActive(a)}
                  disabled={actionId === a._id}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    a.isActive
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}
                >
                  {actionId === a._id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : a.isActive ? (
                    'Active'
                  ) : (
                    'Paused'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(a._id)}
                  disabled={actionId === a._id}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  aria-label="Delete automation"
                >
                  {actionId === a._id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create form */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Create automation
        </h2>

        <form onSubmit={(e) => void handleCreate(e)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lab hours — morning batch"
              className={inputClass}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resume time (start)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hibernate time (stop)
              </label>
              <input
                type="time"
                value={stopTime}
                onChange={(e) => setStopTime(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass}
                disabled={submitting}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Select VMs</label>
              <button
                type="button"
                onClick={toggleAllVms}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {selectedVmIds.size === vms.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {vms.length === 0 ? (
              <p className="text-sm text-gray-500">No VMs available.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {vms.map((vm) => {
                  const selected = selectedVmIds.has(vm._id);
                  return (
                    <button
                      key={vm._id}
                      type="button"
                      onClick={() => toggleVm(vm._id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-blue-600 shrink-0">
                        {selected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </span>
                      <Server className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate">{vm.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{vm.status}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {formError && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || vms.length === 0}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create automation
          </button>
        </form>
      </section>
    </div>
  );
}
