'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchMyAdminServices, type AdminServiceKey } from '@/lib/adminServicesApi';
import {
  createProject,
  previewProjectName,
  PROJECT_SERVICE_LABELS,
} from '@/lib/projectsApi';

export default function CreateProjectPage() {
  const router = useRouter();
  const [previewName, setPreviewName] = useState('');
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<AdminServiceKey[]>([]);
  const [selected, setSelected] = useState<AdminServiceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preview, services] = await Promise.all([
        previewProjectName(),
        fetchMyAdminServices(),
      ]);
      setPreviewName(preview.name);
      setName(preview.name);
      const active = services
        .filter((s) => s.status === 'active' && s.serviceKey !== 'docs')
        .map((s) => s.serviceKey);
      setAvailable(active);
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
    () => clientName.trim().length > 0 && selected.length > 0 && name.trim().length > 0,
    [clientName, selected, name]
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
      const project = await createProject({
        clientName: clientName.trim(),
        name: name.trim() !== previewName ? name.trim() : undefined,
        description: description.trim() || undefined,
        enabledServices: selected,
      });
      router.push(`/console/projects/${project.id}`);
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
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create project</h1>
        <p className="mt-1 text-sm text-gray-500">
          Auto-named for your organization. One project maps to one client.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Project name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
          <p className="mt-1 text-xs text-gray-400">Suggested: {previewName}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Client name</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
            placeholder="e.g. Acme Corp"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Services</label>
          {available.length === 0 ? (
            <p className="text-sm text-gray-500">No active organization services available.</p>
          ) : (
            <div className="space-y-2">
              {available.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(key)}
                    onChange={() => toggleService(key)}
                    className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <span className="text-sm text-gray-800">
                    {PROJECT_SERVICE_LABELS[key] || key}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Create project
        </button>
      </form>
    </div>
  );
}
