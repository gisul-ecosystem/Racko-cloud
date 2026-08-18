'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import {
  createTenantProject,
  fetchTenantEligibleProjectServices,
  fetchTenantProjectClientNames,
  fetchTenantProjects,
  previewTenantProjectName,
} from '@/lib/tenantProjectsApi';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { PROJECT_SERVICE_META } from '@/lib/projectServiceMeta';
import { ClientNameCombobox } from '@/components/console/ClientNameCombobox';

const MAX_DESC = 500;

function ServiceToggleCard({
  serviceKey,
  selected,
  onToggle,
}: {
  serviceKey: AdminServiceKey;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = PROJECT_SERVICE_META[serviceKey];

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition ${
        selected
          ? 'border-[#B91C1C] bg-red-50/40 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div
        className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
          selected
            ? 'border-[#B91C1C] bg-[#B91C1C]'
            : 'border-gray-300 group-hover:border-gray-400'
        }`}
      >
        {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </div>

      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.iconBg} ${meta.iconColor}`}
      >
        {meta.icon}
      </div>

      <div className="pr-6">
        <p className={`text-sm font-semibold ${selected ? 'text-[#B91C1C]' : 'text-gray-800'}`}>
          {meta.label}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{meta.description}</p>
      </div>
    </button>
  );
}

export default function TenantCreateProjectPage() {
  const router = useRouter();
  const [previewName, setPreviewName] = useState('');
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [available, setAvailable] = useState<AdminServiceKey[]>([]);
  const [selected, setSelected] = useState<AdminServiceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preview, services, names] = await Promise.all([
        previewTenantProjectName(),
        fetchTenantEligibleProjectServices(),
        fetchTenantProjectClientNames().catch(() => []),
      ]);
      setPreviewName(preview.name);
      setName(preview.name);
      setAvailable(services.filter((k) => k !== 'docs' && !isServiceHiddenFromUi(k)));
      setClientNames(names);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to prepare create form.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit = useMemo(
    () => clientName.trim().length > 0 && selected.length > 0 && name.trim().length > 0 && !!startDate && !!endDate,
    [clientName, selected, name, startDate, endDate]
  );

  function toggleService(key: AdminServiceKey) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const project = await createTenantProject({
        clientName: clientName.trim(),
        name: name.trim() !== previewName ? name.trim() : undefined,
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        enabledServices: selected,
      });
      router.push(tenantConsole.project(project.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create New Project</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set up a new project to organize and manage your cloud resources.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold text-gray-900">Project Information</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Project Name <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-400">A unique name to identify your project.</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={previewName}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
              />
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Client Name <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-400">The client this project belongs to.</p>
              <ClientNameCombobox
                value={clientName}
                onChange={setClientName}
                clientNames={clientNames}
                required
                disabled={saving}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 p-4">
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              Description <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <p className="mb-2 text-xs text-gray-400">Describe the purpose of this project.</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
              rows={3}
              placeholder="Project for AI model training, experiments and GPU workloads."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {description.length} / {MAX_DESC}
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Start Date <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-400">When does this project start?</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
              />
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                End Date <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-400">When does this project end?</p>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-blue-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Services <span className="text-red-500">*</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-400">
                Select the services to enable for this project.
              </p>
            </div>
            {selected.length > 0 && (
              <span className="rounded-full bg-[#B91C1C] px-2.5 py-0.5 text-xs font-bold text-white">
                {selected.length} selected
              </span>
            )}
          </div>

          {available.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
              No active tenant services available.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {available.map((key) => (
                <ServiceToggleCard
                  key={key}
                  serviceKey={key}
                  selected={selected.includes(key)}
                  onToggle={() => toggleService(key)}
                />
              ))}
            </div>
          )}

          {selected.length === 0 && available.length > 0 && (
            <p className="mt-3 text-xs text-amber-600">Select at least one service to continue.</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Link
            href={tenantConsole.projects}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}
