'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, Pencil, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchMyAdminServices, type AdminServiceKey } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import {
  addProjectServices,
  archiveProject,
  fetchProject,
  fetchProjectClientNames,
  fetchServiceCostReport,
  PROJECT_SERVICE_LABELS,
  removeProjectService,
  updateProject,
  type OrgProject,
  type ProjectReportByServiceRow,
} from '@/lib/projectsApi';
import { ClientNameCombobox } from '@/components/console/ClientNameCombobox';
import {
  getServiceLaunchHref,
  getServiceTransactionsHref,
  PROJECT_SERVICE_META,
} from '@/lib/projectServiceMeta';

function formatInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function ServiceCard({
  serviceKey,
  projectId,
  resourceCount,
  costRow,
  archived,
  saving,
  onRemove,
}: {
  serviceKey: AdminServiceKey;
  projectId: string;
  resourceCount: number;
  costRow: ProjectReportByServiceRow | undefined;
  archived: boolean;
  saving: boolean;
  onRemove: (key: AdminServiceKey) => void;
}) {
  const meta = PROJECT_SERVICE_META[serviceKey] ?? {
    label: serviceKey,
    description: '',
    icon: null,
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
  };
  const totalCost = costRow?.totalDebit ?? 0;
  const txCount = costRow?.transactionCount ?? 0;
  const href = getServiceLaunchHref(serviceKey, 'org', projectId);
  const transactionsHref = getServiceTransactionsHref(serviceKey, 'org', projectId);

  return (
    <div className="relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {!archived && (
        <button
          type="button"
          disabled={saving || resourceCount > 0}
          onClick={() => onRemove(serviceKey)}
          title={
            resourceCount > 0
              ? 'Cannot remove while resources exist'
              : `Remove ${meta.label}`
          }
          className="absolute right-3 top-3 rounded-full p-1 text-gray-300 transition hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconBg} ${meta.iconColor}`}
        >
          {meta.icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
          <p className="text-xs text-gray-400">{meta.description}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-4 text-xs text-gray-500">
        <div>
          <span className="block text-base font-bold text-gray-900">{resourceCount}</span>
          resource{resourceCount !== 1 ? 's' : ''}
        </div>
        <div className="h-6 w-px bg-gray-100" />
        <div>
          <span className="block text-base font-bold text-gray-900">{formatInr(totalCost)}</span>
          total spend
        </div>
        {txCount > 0 && (
          <>
            <div className="h-6 w-px bg-gray-100" />
            <div>
              <span className="block text-base font-bold text-gray-900">{txCount}</span>
              transaction{txCount !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>

      {archived ? (
        <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
          Archived
        </span>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {serviceKey !== 'elastic-servers' && (
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
            >
              Use service
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
          {serviceKey === 'vm-management' && resourceCount > 0 && (
            <Link
              href={`/dashboard/admin/vms?projectId=${projectId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              View VMs
            </Link>
          )}
          {serviceKey === 'create-vm' && resourceCount > 0 && (
            <Link
              href={`/console/create-vm/my-vms?projectId=${projectId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              View Catalog VMs
            </Link>
          )}
          {transactionsHref ? (
            <Link
              href={transactionsHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              View transactions
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [project, setProject] = useState<OrgProject | null>(null);
  const [available, setAvailable] = useState<AdminServiceKey[]>([]);
  const [costRows, setCostRows] = useState<ProjectReportByServiceRow[]>([]);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingService, setPendingService] = useState<AdminServiceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, services, costs, names] = await Promise.all([
        fetchProject(id),
        fetchMyAdminServices(),
        fetchServiceCostReport(id),
        fetchProjectClientNames().catch(() => []),
      ]);
      setProject(p);
      setName(p.name);
      setClientName(p.clientName);
      setDescription(p.description || '');
      setStartDate(p.startDate ? p.startDate.slice(0, 10) : '');
      setEndDate(p.endDate ? p.endDate.slice(0, 10) : '');
      setClientNames(names);
      setAvailable(
        services
          .filter(
            (s) =>
              s.status === 'active' && s.serviceKey !== 'docs' && !isServiceHiddenFromUi(s.serviceKey)
          )
          .map((s) => s.serviceKey)
      );
      setCostRows(costs);
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

  const visibleServices = useMemo(
    () => (project?.enabledServices ?? []).filter((k) => !isServiceHiddenFromUi(k)),
    [project]
  );

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
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setProject(updated);
      setFlash('Project updated.');
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddService(key: AdminServiceKey) {
    if (!project || pendingService) return;
    setPendingService(key);
    setError(null);
    try {
      const updated = await addProjectServices(project.id, [key]);
      setProject(updated);
      setFlash(`Added ${PROJECT_SERVICE_LABELS[key] || key}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add service.');
    } finally {
      setPendingService(null);
    }
  }

  async function handleRemoveService(key: AdminServiceKey) {
    if (!project || pendingService) return;
    setPendingService(key);
    setError(null);
    try {
      const updated = await removeProjectService(project.id, key);
      setProject(updated);
      setFlash(`Removed ${PROJECT_SERVICE_LABELS[key] || key}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove service.');
    } finally {
      setPendingService(null);
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
    <div className="mx-auto max-w-screen-xl space-y-8 pb-10">
      <div>
        <Link
          href="/console/projects"
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{project.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Client: <span className="font-medium text-gray-700">{project.clientName}</span>
              {' · '}
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  project.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {project.status}
              </span>
            </p>
            {project.description && (
              <p className="mt-1 text-sm text-gray-500">{project.description}</p>
            )}
          </div>
          {!archived && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
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

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Services</h2>
            <p className="text-xs text-gray-400">
              Assigned services for this project — click &quot;Use service&quot; to open it.
            </p>
          </div>
          {costRows.length > 0 && (
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
              Total spend:{' '}
              <span className="font-bold text-gray-900">
                {formatInr(costRows.reduce((s, r) => s + r.totalDebit, 0))}
              </span>
            </span>
          )}
        </div>

        {visibleServices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
            No services enabled yet.{' '}
            {!archived && 'Use the “Add service” panel below to assign one.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleServices.map((key) => (
              <ServiceCard
                key={key}
                serviceKey={key}
                projectId={project.id}
                resourceCount={project.resourceCounts?.[key] ?? 0}
                costRow={costRows.find((r) => r.serviceKey === key)}
                archived={archived}
                saving={pendingService !== null}
                onRemove={handleRemoveService}
              />
            ))}
          </div>
        )}

        {!archived && addable.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Add service to this project
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {addable.map((key) => {
                const meta = PROJECT_SERVICE_META[key] ?? {
                  label: key,
                  description: '',
                  icon: null,
                  iconBg: 'bg-gray-100',
                  iconColor: 'text-gray-500',
                };
                return (
                  <div
                    key={key}
                    className="flex flex-col rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-5 transition hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconBg} ${meta.iconColor} opacity-70`}
                      >
                        {meta.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{meta.label}</p>
                        <p className="text-xs text-gray-400">{meta.description}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={pendingService !== null}
                      onClick={() => void handleAddService(key)}
                      className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg border border-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-[#B91C1C] transition hover:bg-[#B91C1C] hover:text-white disabled:opacity-50"
                    >
                      {pendingService === key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span className="text-sm leading-none">+</span>
                      )}
                      Add to project
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Edit project modal ──────────────────────────────────────────── */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Edit Project</h2>
                <p className="mt-0.5 text-xs text-gray-500">Update project details and dates.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="space-y-4 p-6">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Project name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Client name
                    </label>
                    <ClientNameCombobox
                      value={clientName}
                      onChange={setClientName}
                      clientNames={clientNames}
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      max={endDate || undefined}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      End Date
                    </label>
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

              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => void handleArchive()}
                  disabled={saving}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  Archive project
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    disabled={saving}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
