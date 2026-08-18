'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderKanban, Loader2, Plus, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { ClientNameCombobox } from '@/components/console/ClientNameCombobox';
import {
  addProjectServicesForTenant,
  createProjectForTenant,
  fetchEligibleProjectServicesForTenant,
  fetchProjectsForTenant,
  previewProjectNameForTenant,
  PROJECT_SERVICE_LABELS,
  type OrgProject,
} from '@/lib/projectsApi';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function TenantProjectsPanel({ tenantId }: { tenantId: string }) {
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [previewName, setPreviewName] = useState('');
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');

  const clientNames = useMemo(
    () => [...new Set(projects.map((p) => p.clientName).filter(Boolean))].sort(),
    [projects]
  );
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState<AdminServiceKey[]>([]);
  const [selected, setSelected] = useState<AdminServiceKey[]>([]);
  const [formLoading, setFormLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [manageProject, setManageProject] = useState<OrgProject | null>(null);
  const [manageAvailable, setManageAvailable] = useState<AdminServiceKey[]>([]);
  const [manageSelected, setManageSelected] = useState<AdminServiceKey[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [detailProject, setDetailProject] = useState<OrgProject | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await fetchProjectsForTenant(tenantId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openCreate() {
    setShowCreate(true);
    setManageProject(null);
    setDetailProject(null);
    setFlash(null);
    setError(null);
    setFormLoading(true);
    setClientName('');
    setDescription('');
    setSelected([]);
    try {
      const [preview, services] = await Promise.all([
        previewProjectNameForTenant(tenantId),
        fetchEligibleProjectServicesForTenant(tenantId),
      ]);
      setPreviewName(preview.name);
      setName(preview.name);
      setAvailable(services);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to prepare create form.');
      setShowCreate(false);
    } finally {
      setFormLoading(false);
    }
  }

  async function openManage(project: OrgProject) {
    setShowCreate(false);
    setDetailProject(null);
    setManageProject(project);
    setFlash(null);
    setError(null);
    setManageLoading(true);
    setManageSelected([]);
    try {
      const services = await fetchEligibleProjectServicesForTenant(tenantId);
      setManageAvailable(services.filter((k) => !project.enabledServices.includes(k)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load services.');
      setManageProject(null);
    } finally {
      setManageLoading(false);
    }
  }

  function openDetail(project: OrgProject) {
    setShowCreate(false);
    setManageProject(null);
    setFlash(null);
    setError(null);
    setDetailProject(project);
  }

  const canSubmit = useMemo(
    () => clientName.trim().length > 0 && selected.length > 0 && name.trim().length > 0,
    [clientName, selected, name]
  );

  function toggleService(key: AdminServiceKey) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleManageService(key: AdminServiceKey) {
    setManageSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const project = await createProjectForTenant(tenantId, {
        clientName: clientName.trim(),
        name: name.trim() !== previewName ? name.trim() : undefined,
        description: description.trim() || undefined,
        enabledServices: selected,
      });
      setFlash(`Created ${project.name} — visible to the tenant admin.`);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddServices(e: React.FormEvent) {
    e.preventDefault();
    if (!manageProject || manageSelected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await addProjectServicesForTenant(
        tenantId,
        manageProject.id,
        manageSelected
      );
      setFlash(`Updated ${updated.name} — added ${manageSelected.length} service(s).`);
      setManageProject(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add services.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Tenant projects</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Same project records the tenant admin sees under Projects in their console.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void openCreate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#991B1B]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create project
          </button>
        </div>

        {flash && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-2.5 text-sm text-emerald-700">
            {flash}
          </div>
        )}
        {error && !showCreate && !manageProject && !detailProject && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
          </div>
        ) : projects.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FolderKanban className="mx-auto h-9 w-9 text-gray-300" />
            <p className="mt-2 text-sm font-medium text-gray-900">No projects yet</p>
            <p className="mt-1 text-xs text-gray-500">Create a client project for this tenant.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Project</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Services</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-700">{p.clientName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.enabledServices
                      .map((k) => PROJECT_SERVICE_LABELS[k] || k)
                      .join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openDetail(p)}
                        className="text-xs font-semibold text-gray-700 hover:underline"
                      >
                        View project
                      </button>
                      {p.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void openManage(p)}
                          className="text-xs font-semibold text-[#B91C1C] hover:underline"
                        >
                          Add services
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Create project for tenant</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
              </div>
            ) : (
              <form onSubmit={(e) => void handleCreate(e)} className="space-y-4 px-5 py-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Project name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Suggested: {previewName}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Client name</label>
                  <ClientNameCombobox
                    value={clientName}
                    onChange={setClientName}
                    clientNames={clientNames}
                    required
                    disabled={saving}
                    placeholder="End-client company name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">Services</p>
                  {available.length === 0 ? (
                    <p className="text-xs text-amber-700">
                      This tenant has no active services. Assign services first.
                    </p>
                  ) : (
                    <div className="max-h-40 space-y-1.5 overflow-y-auto">
                      {available.map((key) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-sm hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(key)}
                            onChange={() => toggleService(key)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                          />
                          {PROJECT_SERVICE_LABELS[key] || key}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit || saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#991B1B] disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Create project
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {manageProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Add services</h3>
                <p className="mt-0.5 text-xs text-gray-500">{manageProject.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setManageProject(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {manageLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
              </div>
            ) : (
              <form onSubmit={(e) => void handleAddServices(e)} className="space-y-4 px-5 py-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Already enabled</p>
                  <p className="text-sm text-gray-800">
                    {manageProject.enabledServices
                      .map((k) => PROJECT_SERVICE_LABELS[k] || k)
                      .join(', ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">Add from tenant entitlements</p>
                  {manageAvailable.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      All eligible tenant services are already on this project.
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {manageAvailable.map((key) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-sm hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={manageSelected.includes(key)}
                            onChange={() => toggleManageService(key)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                          />
                          {PROJECT_SERVICE_LABELS[key] || key}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setManageProject(null)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manageSelected.length === 0 || saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#991B1B] disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Add services
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {detailProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{detailProject.name}</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Client: {detailProject.clientName} · {detailProject.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailProject(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">Project ID</p>
                  <p className="mt-0.5 break-all text-sm text-gray-900">{detailProject.id}</p>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">Auto-generated name</p>
                  <p className="mt-0.5 text-sm text-gray-900">{detailProject.autoGeneratedName}</p>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">Start date</p>
                  <p className="mt-0.5 text-sm text-gray-900">
                    {detailProject.startDate ? formatDate(detailProject.startDate) : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">End date</p>
                  <p className="mt-0.5 text-sm text-gray-900">
                    {detailProject.endDate ? formatDate(detailProject.endDate) : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">Created</p>
                  <p className="mt-0.5 text-sm text-gray-900">{formatDate(detailProject.createdAt)}</p>
                </div>
                <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-gray-500">Updated</p>
                  <p className="mt-0.5 text-sm text-gray-900">{formatDate(detailProject.updatedAt)}</p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </p>
                <p className="rounded-lg border border-gray-100 px-3 py-2.5 text-sm text-gray-800">
                  {detailProject.description?.trim() || 'No description provided.'}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Enabled services
                </p>
                {detailProject.enabledServices.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500">
                    No services enabled.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {detailProject.enabledServices.map((key) => (
                      <li
                        key={key}
                        className="rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-900"
                      >
                        {PROJECT_SERVICE_LABELS[key] || key}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                {detailProject.status === 'active' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const p = detailProject;
                      setDetailProject(null);
                      void openManage(p);
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Add services
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDetailProject(null)}
                  className="rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#991B1B]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
