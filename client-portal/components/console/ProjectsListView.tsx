'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FolderKanban,
  Layers3,
  Link2,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Server,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { fetchMyAdminServices, type AdminServiceKey } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import {
  createProject,
  fetchProject,
  fetchProjectCostReport,
  fetchProjects,
  previewProjectName,
  PROJECT_SERVICE_LABELS,
  resolveProjectServiceLabel,
  type OrgProject,
  type ProjectNamePreview,
  type ProjectReportByProjectRow,
} from '@/lib/projectsApi';
import {
  createTenantProject,
  fetchTenantEligibleProjectServices,
  fetchTenantProject,
  fetchTenantProjectCostReport,
  fetchTenantProjects,
  previewTenantProjectName,
} from '@/lib/tenantProjectsApi';
import { fetchTenantServiceCatalog } from '@/lib/tenantPortalApi';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { PROJECT_SERVICE_META } from '@/lib/projectServiceMeta';
import {
  hexToRgba,
  tenantAccentButton,
  tenantAccentSelectedBox,
  tenantAccentText,
} from '@/lib/tenantAccentStyles';

const PAGE_SIZE = 4;
const ORG_ACCENT = '#B91C1C';

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

export type ProjectsPortal = 'org' | 'tenant';

interface CreateProjectInput {
  clientName: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  enabledServices: AdminServiceKey[];
}

interface AssignableServiceOption {
  key: AdminServiceKey;
  label: string;
}

interface ProjectsPortalAdapter {
  list: () => Promise<OrgProject[]>;
  detail: (id: string) => Promise<OrgProject>;
  costReport: () => Promise<ProjectReportByProjectRow[]>;
  namePreview: () => Promise<ProjectNamePreview>;
  create: (input: CreateProjectInput) => Promise<OrgProject>;
  assignableServices: () => Promise<AssignableServiceOption[]>;
  projectHref: (id: string) => string;
  reportsHref: string;
}

function orgAdapter(): ProjectsPortalAdapter {
  return {
    list: fetchProjects,
    detail: fetchProject,
    costReport: fetchProjectCostReport,
    namePreview: previewProjectName,
    create: createProject,
    assignableServices: async () => {
      const services = await fetchMyAdminServices();
      return services
        .filter(
          (service) =>
            service.status === 'active'
            && service.serviceKey !== 'docs'
            && service.serviceKey !== 'machine-manager'
            && !isServiceHiddenFromUi(service.serviceKey)
        )
        .map((service) => ({
          key: service.serviceKey,
          label: service.label || PROJECT_SERVICE_LABELS[service.serviceKey] || service.serviceKey,
        }));
    },
    projectHref: (id) => `/console/projects/${id}`,
    reportsHref: '/console/projects/reports',
  };
}

function tenantAdapter(): ProjectsPortalAdapter {
  return {
    list: fetchTenantProjects,
    detail: fetchTenantProject,
    costReport: fetchTenantProjectCostReport,
    namePreview: previewTenantProjectName,
    create: createTenantProject,
    assignableServices: async () => {
      const [services, catalog] = await Promise.all([
        fetchTenantEligibleProjectServices(),
        fetchTenantServiceCatalog().catch(() => [] as Array<{ key: string; label: string }>),
      ]);
      const labels = Object.fromEntries(catalog.map((c) => [c.key, c.label]));
      return services
        .filter(
          (key) =>
            key !== 'docs'
            && key !== 'machine-manager'
            && !isServiceHiddenFromUi(key)
        )
        .map((key) => ({
          key,
          label: labels[key] || PROJECT_SERVICE_LABELS[key] || key,
        }));
    },
    projectHref: (id) => tenantConsole.project(id),
    reportsHref: tenantConsole.projectsReports,
  };
}

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Recently';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function projectInitials(name: string): string {
  const parts = name.replace(/[-_]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'PR';
}

export function ProjectsListView({
  portal,
  accentColor,
}: {
  portal: ProjectsPortal;
  /** Tenant brand/branch primary color. Org defaults to Racko red. */
  accentColor?: string;
}) {
  const api = useMemo(() => (portal === 'tenant' ? tenantAdapter() : orgAdapter()), [portal]);
  const accent = accentColor?.trim() || ORG_ACCENT;
  const accentSoft = hexToRgba(accent, 0.1);
  const accentSofter = hexToRgba(accent, 0.05);
  const accentFocus = {
    ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
  } as React.CSSProperties;

  const [showAll, setShowAll] = useState(false);
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [costRows, setCostRows] = useState<ProjectReportByProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [page, setPage] = useState(1);
  const [modalStep, setModalStep] = useState<'info' | 'services' | 'success' | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [availableServices, setAvailableServices] = useState<AssignableServiceOption[]>([]);
  const [selectedServices, setSelectedServices] = useState<AdminServiceKey[]>([]);
  const [createdProject, setCreatedProject] = useState<OrgProject | null>(null);

  const serviceLabel = useCallback(
    (key: string) => {
      const fromAvailable = availableServices.find((s) => s.key === key)?.label;
      return resolveProjectServiceLabel(key, fromAvailable);
    },
    [availableServices]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, costs] = await Promise.all([api.list(), api.costReport()]);
      const detailed = await Promise.all(
        list.map(async (project) => {
          try {
            return await api.detail(project.id);
          } catch {
            return project;
          }
        })
      );
      setProjects(detailed);
      setCostRows(costs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProjects = projects.filter((project) => project.status === 'active');
  const totalSpend = costRows.reduce((sum, row) => sum + row.totalDebit, 0);
  const totalResources = projects.reduce(
    (total, project) =>
      total + Object.values(project.resourceCounts || {}).reduce((sum, count) => sum + count, 0),
    0
  );
  const projectCards = activeProjects.slice(0, 3);
  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        )
        .slice(0, 5),
    [projects]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
  }, [projects, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  function openAllView() {
    setShowAll(true);
  }

  function openDashboardView() {
    setShowAll(false);
    setQuery('');
    setStatusFilter('all');
    setPage(1);
  }

  async function openCreateModal() {
    setModalStep('info');
    setModalLoading(true);
    setModalError(null);
    setCreatedProject(null);
    setClientName('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setSelectedServices([]);
    try {
      const [preview, services] = await Promise.all([
        api.namePreview(),
        api.assignableServices(),
      ]);
      setPreviewName(preview.name);
      setProjectName(preview.name);
      setAvailableServices(services);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to prepare project form.');
    } finally {
      setModalLoading(false);
    }
  }

  function closeCreateModal() {
    if (modalSaving) return;
    setModalStep(null);
    setModalError(null);
  }

  function continueToServices(event: React.FormEvent) {
    event.preventDefault();
    if (!projectName.trim() || !clientName.trim()) return;
    setModalError(null);
    setModalStep('services');
  }

  function toggleService(serviceKey: AdminServiceKey) {
    setSelectedServices((current) =>
      current.includes(serviceKey)
        ? current.filter((key) => key !== serviceKey)
        : [...current, serviceKey]
    );
  }

  async function finishCreateProject() {
    if (selectedServices.length === 0) {
      setModalError('Select at least one service for this project.');
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      const created = await api.create({
        clientName: clientName.trim(),
        name: projectName.trim() !== previewName ? projectName.trim() : undefined,
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        enabledServices: selectedServices,
      });
      let detailed = created;
      try {
        detailed = await api.detail(created.id);
      } catch {
        // The create response is enough to update the page if detail hydration fails.
      }
      setProjects((current) => [detailed, ...current]);
      setCreatedProject(detailed);
      setModalStep('success');
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setModalSaving(false);
    }
  }

  const stats = [
    {
      label: 'Total projects',
      value: projects.length.toLocaleString('en-IN'),
      detail: `${activeProjects.length} currently active`,
      icon: FolderKanban,
      iconClass: 'bg-blue-50 text-blue-600',
      borderClass: 'border-l-blue-500',
    },
    {
      label: 'Total spend',
      value: formatInr(totalSpend),
      detail: `${costRows.reduce((sum, row) => sum + row.transactionCount, 0)} transactions`,
      icon: CircleDollarSign,
      iconClass: 'bg-rose-50 text-rose-500',
      borderClass: 'border-l-rose-500',
    },
    {
      label: 'Active projects',
      value: activeProjects.length.toLocaleString('en-IN'),
      detail: `${Math.max(projects.length - activeProjects.length, 0)} archived`,
      icon: Activity,
      iconClass: 'bg-violet-50 text-violet-500',
      borderClass: 'border-l-violet-500',
    },
    {
      label: 'Total resources',
      value: totalResources.toLocaleString('en-IN'),
      detail: `Across ${projects.length} project${projects.length === 1 ? '' : 's'}`,
      icon: Server,
      iconClass: 'bg-emerald-50 text-emerald-600',
      borderClass: 'border-l-emerald-500',
    },
  ];

  return (
    <div className="mx-auto max-w-screen-xl space-y-5 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {showAll && (
            <button
              type="button"
              onClick={openDashboardView}
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              My Projects
            </button>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {showAll ? 'All Projects' : 'My Projects'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {showAll
              ? 'Manage and organize all your cloud projects in one place.'
              : 'Create and manage your infrastructure projects.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openCreateModal()}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          style={tenantAccentButton(accent)}
        >
          <Plus className="h-4 w-4" />
          Create Project
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
        </div>
      ) : (
        <>
          {/* Stats stay mounted when switching views — no reload */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={`rounded-xl border border-gray-200 border-l-4 ${stat.borderClass} bg-white p-5 shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {stat.label}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-gray-950">{stat.value}</p>
                    </div>
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg shadow-sm ${stat.iconClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-4 text-xs text-gray-500">{stat.detail}</p>
                </div>
              );
            })}
          </section>

          {showAll ? (
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects by name or description..."
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:bg-white focus:ring-2"
                    style={
                      {
                        ...accentFocus,
                        borderColor: undefined,
                      } as React.CSSProperties
                    }
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = accent;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '';
                    }}
                  />
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                  <span className="font-medium text-gray-500">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as 'all' | 'active' | 'archived')
                    }
                    className="bg-transparent text-sm font-medium text-gray-800 outline-none"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>

              {pageItems.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <FolderKanban className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-900">No projects found</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Try a different search, or create a new project.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pageItems.map((project, index) => {
                    const resourceCount = Object.values(project.resourceCounts || {}).reduce(
                      (sum, count) => sum + count,
                      0
                    );
                    const serviceTags = project.enabledServices.slice(0, 3);
                    const isActive = project.status === 'active';
                    const avatarClass = AVATAR_COLORS[index % AVATAR_COLORS.length];

                    return (
                      <Link
                        key={project.id}
                        href={api.projectHref(project.id)}
                        className="flex items-center gap-4 px-4 py-4 transition hover:bg-gray-50/80 sm:px-5"
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass}`}
                        >
                          {projectInitials(project.clientName || project.name)}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-gray-900">
                              {project.name}
                            </h3>
                            <span className="inline-flex shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                              Client · {project.clientName}
                            </span>
                          </div>
                          {project.description && (
                            <p className="mt-1 truncate text-xs text-gray-500">
                              {project.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {serviceTags.map((service) => {
                              const count = project.resourceCounts?.[service] ?? 0;
                              return (
                                <span
                                  key={service}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600"
                                >
                                  <Server className="h-3 w-3 text-gray-400" />
                                  {serviceLabel(service)}
                                  {count > 0 ? ` (${count})` : ''}
                                </span>
                              );
                            })}
                            {project.enabledServices.length > serviceTags.length && (
                              <span
                                className="rounded-md px-2 py-1 text-[11px] font-medium"
                                style={{ backgroundColor: accentSoft, color: accent }}
                              >
                                +{project.enabledServices.length - serviceTags.length}
                              </span>
                            )}
                            {project.enabledServices.length === 0 && (
                              <span className="text-[11px] text-gray-400">
                                {resourceCount} resources total
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              isActive ? 'text-emerald-600' : 'text-red-500'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isActive ? 'bg-emerald-500' : 'bg-red-500'
                              }`}
                            />
                            {isActive ? 'Running' : 'Archived'}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            Updated {relativeTime(project.updatedAt)}
                          </span>
                        </div>

                        <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
                      </Link>
                    );
                  })}
                </div>
              )}

              {filtered.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <p className="text-xs text-gray-500">
                    Showing {pageStart + 1} to {Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
                    {filtered.length} projects
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
                          n === currentPage
                            ? 'text-white'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        style={n === currentPage ? tenantAccentButton(accent) : undefined}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Projects</h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Open a project to launch services and review its spend.
                    </p>
                  </div>
                  <Link
                    href={api.reportsHref}
                    className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    style={tenantAccentText(accent)}
                  >
                    View reports <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => void openCreateModal()}
                    className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center transition hover:opacity-95"
                    style={{
                      borderColor: hexToRgba(accent, 0.35),
                      backgroundColor: accentSofter,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = accent;
                      e.currentTarget.style.backgroundColor = accentSoft;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = hexToRgba(accent, 0.35);
                      e.currentTarget.style.backgroundColor = accentSofter;
                    }}
                  >
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full border bg-white shadow-sm"
                      style={{ borderColor: hexToRgba(accent, 0.35), color: accent }}
                    >
                      <Plus className="h-6 w-6" />
                    </span>
                    <span className="mt-3 text-sm font-semibold text-gray-900">New Project</span>
                    <span className="mt-2 max-w-36 text-xs leading-5 text-gray-500">
                      Create a project to get started with Racko.
                    </span>
                  </button>

                  {projectCards.map((project) => {
                    const resourceCount = Object.values(project.resourceCounts || {}).reduce(
                      (sum, count) => sum + count,
                      0
                    );
                    const visibleServices = project.enabledServices.slice(0, 3);
                    const extraServices = project.enabledServices.length - visibleServices.length;

                    return (
                      <article
                        key={project.id}
                        className="flex min-h-56 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <Link2 className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-gray-900">
                              {project.name}
                            </h3>
                            <span className="mt-1 inline-flex max-w-full truncate rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                              Client · {project.clientName}
                            </span>
                          </div>
                          <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">
                            Active
                          </span>
                          <MoreVertical className="h-4 w-4 text-gray-300" />
                        </div>

                        <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
                          <span>{project.enabledServices.length} services</span>
                          <span className="h-1 w-1 rounded-full bg-gray-300" />
                          <span>{resourceCount} resources</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {visibleServices.map((service, index) => (
                            <span
                              key={service}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                                index === 0
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : index === 1
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-violet-50 text-violet-700'
                              }`}
                            >
                              {serviceLabel(service)}
                            </span>
                          ))}
                          {extraServices > 0 && (
                            <span
                              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                              style={{ backgroundColor: accentSoft, color: accent }}
                            >
                              +{extraServices}
                            </span>
                          )}
                        </div>

                        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4">
                          <span className="text-[10px] text-gray-400">
                            Updated {relativeTime(project.updatedAt)}
                          </span>
                          <Link
                            href={api.projectHref(project.id)}
                            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition hover:text-white"
                            style={{
                              borderColor: hexToRgba(accent, 0.35),
                              backgroundColor: accentSoft,
                              color: accent,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = accent;
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = accentSoft;
                              e.currentTarget.style.color = accent;
                            }}
                          >
                            Open Project <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {activeProjects.length > projectCards.length && (
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={openAllView}
                      className="text-xs font-semibold hover:underline"
                      style={tenantAccentText(accent)}
                    >
                      View all {activeProjects.length} projects
                    </button>
                  </div>
                )}
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
                    <span className="text-xs text-gray-400">Latest project updates</span>
                  </div>

                  {recentProjects.length === 0 ? (
                    <p className="py-10 text-center text-sm text-gray-500">
                      Project activity will appear here.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {recentProjects.map((project) => (
                        <div key={project.id} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                            <Layers3 className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">
                              Project updated
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {project.name} · {project.clientName}
                            </p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
                            <Clock3 className="h-3 w-3" />
                            {relativeTime(project.updatedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">Tracking Health</h2>
                    <Link
                      href={api.reportsHref}
                      className="text-xs font-semibold hover:underline"
                      style={tenantAccentText(accent)}
                    >
                      View reports
                    </Link>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Project tracking operational
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Cost and resource attribution is available.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    {[
                      ['Active projects', activeProjects.length, projects.length],
                      [
                        'Projects with services',
                        projects.filter((p) => p.enabledServices.length > 0).length,
                        projects.length,
                      ],
                      [
                        'Projects with cost records',
                        costRows.filter((row) => row.projectId).length,
                        projects.length,
                      ],
                      [
                        'Resource attribution',
                        projects.filter((p) => p.resourceCounts).length,
                        projects.length,
                      ],
                    ].map(([label, value, total]) => {
                      const percentage =
                        Number(total) > 0
                          ? Math.min(100, (Number(value) / Number(total)) * 100)
                          : 0;
                      return (
                        <div
                          key={String(label)}
                          className="grid grid-cols-[1fr_auto_70px] items-center gap-3"
                        >
                          <span className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {label}
                          </span>
                          <span className="text-xs font-medium text-gray-700">
                            {String(value)}/{String(total)}
                          </span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <span
                              className="block h-full rounded-full bg-emerald-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {modalStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateModal();
          }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={tenantAccentText(accent)}
                >
                  {modalStep === 'info'
                    ? 'Step 1 of 2'
                    : modalStep === 'services'
                      ? 'Step 2 of 2'
                      : 'Complete'}
                </p>
                <h2
                  id="create-project-title"
                  className="mt-1 text-xl font-bold text-gray-900"
                >
                  {modalStep === 'info'
                    ? 'Create New Project'
                    : modalStep === 'services'
                      ? 'Add Services'
                      : 'Project Created'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {modalStep === 'info'
                    ? 'Set up a new project to organize and manage your cloud resources.'
                    : modalStep === 'services'
                      ? 'Choose the Racko services this project can use.'
                      : 'Your project and its services are ready to use.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={modalSaving}
                aria-label="Close create project"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalLoading ? (
              <div className="flex min-h-72 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
              </div>
            ) : modalStep === 'info' ? (
              <form onSubmit={continueToServices}>
                <div className="space-y-4 p-5">
                  {modalError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {modalError}
                    </div>
                  )}

                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-900">Project Information</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                          Project Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={projectName}
                          onChange={(event) => setProjectName(event.target.value)}
                          required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                          style={accentFocus}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = accent;
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '';
                          }}
                        />
                        <p className="mt-1 text-[11px] text-gray-400">
                          A unique name to identify your project.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                          Client Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={clientName}
                          onChange={(event) => setClientName(event.target.value)}
                          required
                          placeholder="e.g. Acme Corp"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                          style={accentFocus}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = accent;
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '';
                          }}
                        />
                        <p className="mt-1 text-[11px] text-gray-400">
                          The client this project belongs to.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <label className="block text-xs font-semibold text-gray-700">
                          Description <span className="font-normal text-gray-400">(Optional)</span>
                        </label>
                        <span className="text-[11px] text-gray-400">
                          {description.length} / 500
                        </span>
                      </div>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value.slice(0, 500))}
                        rows={3}
                        placeholder="Describe the purpose and workloads for this project."
                        className="mt-1.5 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                        style={accentFocus}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = accent;
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '';
                        }}
                      />
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                          Start Date <span className="font-normal text-gray-400">(Optional)</span>
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          max={endDate || undefined}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                          style={accentFocus}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = accent;
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '';
                          }}
                        />
                        <p className="mt-1 text-[11px] text-gray-400">When does this project start?</p>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                          End Date <span className="font-normal text-gray-400">(Optional)</span>
                        </label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={startDate || undefined}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:ring-2"
                          style={accentFocus}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = accent;
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '';
                          }}
                        />
                        <p className="mt-1 text-[11px] text-gray-400">When does this project end?</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!projectName.trim() || !clientName.trim()}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={tenantAccentButton(accent)}
                  >
                    Continue to Services
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : modalStep === 'services' ? (
              <>
                <div className="space-y-5 p-6">
                  {modalError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {modalError}
                    </div>
                  )}

                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Link2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {projectName}
                        </p>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          Client · {clientName}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {selectedServices.length} service
                        {selectedServices.length === 1 ? '' : 's'} selected
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          Choose Racko Services
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Select at least one infrastructure service for this project.
                        </p>
                      </div>
                      {selectedServices.length > 0 && (
                        <span
                          className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                          style={tenantAccentButton(accent)}
                        >
                          {selectedServices.length} selected
                        </span>
                      )}
                    </div>

                    {availableServices.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500">
                        No active services are available.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {availableServices.map((option) => {
                          const serviceKey = option.key;
                          const meta = PROJECT_SERVICE_META[serviceKey];
                          const selected = selectedServices.includes(serviceKey);
                          return (
                            <button
                              key={serviceKey}
                              type="button"
                              onClick={() => toggleService(serviceKey)}
                              className={`relative flex min-h-28 flex-col rounded-xl border-2 p-3 text-left transition ${
                                selected
                                  ? 'shadow-sm'
                                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                              }`}
                              style={selected ? tenantAccentSelectedBox(accent) : undefined}
                            >
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta?.iconBg ?? 'bg-gray-100'} ${meta?.iconColor ?? 'text-gray-600'}`}
                              >
                                {meta?.icon}
                              </span>
                              {selected && (
                                <span
                                  className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-white"
                                  style={tenantAccentButton(accent)}
                                >
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                              )}
                              <span className="mt-2 text-xs font-semibold text-gray-900">
                                {option.label || meta?.label || serviceKey}
                              </span>
                              <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-gray-500">
                                {meta?.description || ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setModalStep('info');
                    }}
                    disabled={modalSaving}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishCreateProject()}
                    disabled={modalSaving || selectedServices.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={tenantAccentButton(accent)}
                  >
                    {modalSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Create Project
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
                    <Check className="h-8 w-8" strokeWidth={2.5} />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-gray-900">Project is ready</h3>
                  <p className="mt-2 max-w-md text-sm text-gray-500">
                    {createdProject?.name || projectName} was created for {clientName} with{' '}
                    {selectedServices.length} service
                    {selectedServices.length === 1 ? '' : 's'} enabled.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
                  {createdProject && (
                    <Link
                      href={api.projectHref(createdProject.id)}
                      className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Open Project
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    style={tenantAccentButton(accent)}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
