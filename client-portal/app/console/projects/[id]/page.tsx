'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchMyAdminServices, type AdminServiceKey } from '@/lib/adminServicesApi';
import {
  addProjectServices,
  archiveProject,
  fetchProject,
  PROJECT_SERVICE_LABELS,
  removeProjectService,
  updateProject,
  type OrgProject,
} from '@/lib/projectsApi';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [project, setProject] = useState<OrgProject | null>(null);
  const [available, setAvailable] = useState<AdminServiceKey[]>([]);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, services] = await Promise.all([fetchProject(id), fetchMyAdminServices()]);
      setProject(p);
      setName(p.name);
      setClientName(p.clientName);
      setDescription(p.description || '');
      setAvailable(
        services
          .filter((s) => s.status === 'active' && s.serviceKey !== 'docs')
          .map((s) => s.serviceKey)
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load project.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addable = useMemo(() => {
    if (!project) return [];
    return available.filter((k) => !project.enabledServices.includes(k));
  }, [available, project]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!project || project.status === 'archived') return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        clientName: clientName.trim(),
        description: description.trim() || null,
      });
      setProject(updated);
      setFlash('Project updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddService(key: AdminServiceKey) {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await addProjectServices(project.id, [key]);
      setProject(updated);
      setFlash(`Added ${PROJECT_SERVICE_LABELS[key] || key}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add service.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveService(key: AdminServiceKey) {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await removeProjectService(project.id, key);
      setProject(updated);
      setFlash(`Removed ${PROJECT_SERVICE_LABELS[key] || key}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove service.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!project) return;
    if (!window.confirm('Archive this project? New resources cannot be added afterward.')) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await archiveProject(project.id);
      setProject(updated);
      setFlash('Project archived.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to archive project.');
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

  if (!project) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error || 'Project not found.'}</p>
        <button
          type="button"
          onClick={() => router.push('/console/projects')}
          className="text-sm font-medium text-[#B91C1C] hover:underline"
        >
          Back to projects
        </button>
      </div>
    );
  }

  const archived = project.status === 'archived';

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <Link
          href="/console/projects"
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          All projects
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{project.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Client: {project.clientName} · Status: {project.status}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {flash && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {flash}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Project name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={archived}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Client name</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            disabled={archived}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={archived}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
        </div>
        {!archived && (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        )}
      </form>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Enabled services</h2>
        <ul className="mt-3 space-y-2">
          {project.enabledServices.map((key) => {
            const count = project.resourceCounts?.[key] ?? 0;
            return (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
              >
                <span>
                  {PROJECT_SERVICE_LABELS[key] || key}
                  <span className="ml-2 text-xs text-gray-400">{count} resource(s)</span>
                </span>
                {!archived && (
                  <button
                    type="button"
                    disabled={saving || count > 0}
                    onClick={() => void handleRemoveService(key)}
                    className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
                    title={count > 0 ? 'Cannot remove while resources exist' : 'Remove service'}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {!archived && addable.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
              Add service
            </p>
            <div className="flex flex-wrap gap-2">
              {addable.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={saving}
                  onClick={() => void handleAddService(key)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  + {PROJECT_SERVICE_LABELS[key] || key}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!archived && (
        <button
          type="button"
          onClick={() => void handleArchive()}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Archive project
        </button>
      )}
    </div>
  );
}
