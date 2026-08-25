'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, ShoppingCart, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../../../lib/apiClient';
import { useVmCatalogPortal } from '../../../../context/VmCatalogPortalContext';
import {
  type CatalogSoftwareOption,
  type IVmCatalogPlan,
  type VmCatalogCategory,
} from '../../../../lib/vmCatalogApi';
import { ProjectSelect } from '../../../../components/console/ProjectSelect';
import {
  createProject,
  fetchProjectClientNames,
  fetchProjects,
  previewProjectName,
} from '../../../../lib/projectsApi';
import { ClientNameCombobox } from '../../../../components/console/ClientNameCombobox';
import {
  createTenantProject,
  fetchTenantProjectClientNames,
  fetchTenantProjects,
  previewTenantProjectName,
} from '../../../../lib/tenantProjectsApi';

const OS_OPTIONS: { id: VmCatalogCategory; label: string }[] = [
  { id: 'ubuntu', label: 'Ubuntu' },
  { id: 'rocky', label: 'Rocky' },
  { id: 'debian', label: 'Debian' },
  { id: 'windows', label: 'Windows' },
];

const BILLING_KEYS = ['hourly', 'monthly', 'quarterly', 'yearly'] as const;
type BillingKey = (typeof BILLING_KEYS)[number];
type DrawerStep = 'configure' | 'software';

const BILLING_LABELS: Record<BillingKey, string> = {
  hourly: 'Hourly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const GST_RATE = 0.18;

function inr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹ ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function priceForPeriod(
  plan: IVmCatalogPlan,
  period: BillingKey,
  category?: VmCatalogCategory
): number | null {
  const bucket =
    category === 'windows' ? 'windows' : category === 'gpu' ? 'gpu' : 'linux';
  if (plan.sellPricesByCategory?.[bucket]) {
    return plan.sellPricesByCategory[bucket][period];
  }
  return plan[period];
}

function availableBillings(plan: IVmCatalogPlan, category?: VmCatalogCategory): BillingKey[] {
  return BILLING_KEYS.filter((k) => {
    const price = priceForPeriod(plan, k, category);
    return price != null && Number(price) > 0;
  });
}

const WINDOWS_INSTALL_METHODS = new Set(['choco', 'winget', 'msi', 'exe', 'zip', 'script']);
const LINUX_INSTALL_METHODS = new Set(['apt', 'zip', 'script']);

/** Only packages that match the VM OS chosen in step 1 (OS + install method). */
function softwareMatchesSelectedVmOs(
  sw: CatalogSoftwareOption,
  category: VmCatalogCategory
): boolean {
  if (category === 'windows') {
    return (
      sw.supportedOS.includes('windows') &&
      WINDOWS_INSTALL_METHODS.has(sw.installMethod)
    );
  }
  return sw.supportedOS.includes('linux') && LINUX_INSTALL_METHODS.has(sw.installMethod);
}

function selectedVmOsLabel(category: VmCatalogCategory): string {
  if (category === 'windows') return 'Windows';
  const opt = OS_OPTIONS.find((o) => o.id === category);
  return opt?.label ?? 'Linux';
}

function softwareMonogram(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return 'SW';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function softwareIconTone(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('docker') || lower.includes('kubernetes')) {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }
  if (lower.includes('python') || lower.includes('anaconda')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (lower.includes('mysql') || lower.includes('postgres') || lower.includes('mongo')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  if (lower.includes('chrome') || lower.includes('edge') || lower.includes('postman')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function softwareIconAlt(name: string): string {
  return `${name} icon`;
}

export default function CreateVmPage() {
  const router = useRouter();
  const { api, routes, isReady } = useVmCatalogPortal();
  const projectPortal =
    routes.hub === '/console' || routes.hub === '/super-admin-console' ? 'org' : 'tenant';
  const isSuperAdminCatalog = routes.hub === '/super-admin-console';
  const [plans, setPlans] = useState<IVmCatalogPlan[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<IVmCatalogPlan | null>(null);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>('configure');
  const [os, setOs] = useState<VmCatalogCategory>('ubuntu');
  const [billing, setBilling] = useState<BillingKey>('monthly');
  const [quantity, setQuantity] = useState('1');
  const [projectId, setProjectId] = useState('');
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  // Create-project modal
  const [cpOpen, setCpOpen] = useState(false);
  const [cpPreviewName, setCpPreviewName] = useState('');
  const [cpName, setCpName] = useState('');
  const [cpClientName, setCpClientName] = useState('');
  const [cpClientNames, setCpClientNames] = useState<string[]>([]);
  const [cpDescription, setCpDescription] = useState('');
  const [cpStartDate, setCpStartDate] = useState('');
  const [cpEndDate, setCpEndDate] = useState('');
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [softwareMode, setSoftwareMode] = useState<'skip' | 'select'>('skip');
  const [selectedSoftwareIds, setSelectedSoftwareIds] = useState<string[]>([]);
  const [softwareOptions, setSoftwareOptions] = useState<CatalogSoftwareOption[]>([]);
  const [brokenSoftwareIconIds, setBrokenSoftwareIconIds] = useState<Set<string>>(new Set());
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareLoading, setSoftwareLoading] = useState(false);
  const [softwareError, setSoftwareError] = useState<string | null>(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await api.fetchPlans());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isReady) void load();
  }, [load, isReady]);

  const loadSoftwareCatalog = useCallback(async () => {
    setSoftwareLoading(true);
    setSoftwareError(null);
    try {
      setSoftwareOptions(await api.fetchSoftwareOptions());
    } catch (err) {
      setSoftwareOptions([]);
      setSoftwareError(
        err instanceof ApiError ? err.message : 'Failed to load software catalog.'
      );
    } finally {
      setSoftwareLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!selected || drawerStep !== 'software' || !isReady) return;
    setBrokenSoftwareIconIds(new Set());
    void loadSoftwareCatalog();
  }, [selected, drawerStep, isReady, loadSoftwareCatalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) =>
      [p.name, String(p.vcpu), String(p.ramGb), String(p.ssdGb)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [plans, search]);

  const softwareForOs = useMemo(() => {
    return softwareOptions.filter((sw) => softwareMatchesSelectedVmOs(sw, os));
  }, [softwareOptions, os]);

  const filteredSoftware = useMemo(() => {
    const q = softwareSearch.trim().toLowerCase();
    if (!q) return softwareForOs;
    return softwareForOs.filter((sw) =>
      [sw.name, sw.version, sw.installMethod]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [softwareForOs, softwareSearch]);

  const showHourly = isSuperAdminCatalog || plans.some((p) => p.hourlyEnabled === true);

  function openPlan(plan: IVmCatalogPlan) {
    const cycles = availableBillings(plan, 'ubuntu');
    setSelected(plan);
    setDrawerStep('configure');
    setOs('ubuntu');
    setBilling(cycles.includes('monthly') ? 'monthly' : cycles[0] || 'monthly');
    setQuantity('1');
    setProjectId('');
    setSoftwareMode('skip');
    setSelectedSoftwareIds([]);
    setSoftwareSearch('');
    setSoftwareOptions([]);
    setSoftwareError(null);
    setBuyError(null);
  }

  function closeDrawer() {
    setSelected(null);
    setDrawerStep('configure');
    setBuyError(null);
  }

  function toggleSoftware(id: string) {
    setSelectedSoftwareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  useEffect(() => {
    if (!selected) return;
    const cycles = availableBillings(selected, os);
    if (!cycles.includes(billing)) {
      setBilling(cycles.includes('monthly') ? 'monthly' : cycles[0] || 'monthly');
    }
    setSelectedSoftwareIds((prev) =>
      prev.filter((id) => {
        const sw = softwareOptions.find((s) => s._id === id);
        return sw ? softwareMatchesSelectedVmOs(sw, os) : false;
      })
    );
  }, [selected, os, billing, softwareOptions]);

  const vmOsLabel = selectedVmOsLabel(os);

  const unitPrice = selected ? Number(priceForPeriod(selected, billing, os) ?? 0) : 0;
  const qty = Math.max(1, Number(quantity) || 1);
  const subtotal = unitPrice * qty;
  const tax = Math.round(subtotal * GST_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const configureValid =
    selected != null &&
    availableBillings(selected, os).includes(billing) &&
    unitPrice > 0;

  const softwareStepBlocked =
    softwareMode === 'select' &&
    softwareForOs.length > 0 &&
    selectedSoftwareIds.length === 0;

  function goToSoftwareStep() {
    if (!configureValid) {
      setBuyError('Select a valid billing cycle for this template.');
      return;
    }
    setBuyError(null);
    setSoftwareSearch('');
    setSelectedSoftwareIds((prev) =>
      prev.filter((id) => {
        const sw = softwareOptions.find((s) => s._id === id);
        return sw ? softwareMatchesSelectedVmOs(sw, os) : false;
      })
    );
    setDrawerStep('software');
  }

  async function openCpModal() {
    setCpClientName('');
    setCpDescription('');
    setCpStartDate('');
    setCpEndDate('');
    setCpError(null);
    setCpPreviewName('');
    setCpName('');
    setCpOpen(true);
    try {
      const loadClientNames = async (): Promise<string[]> => {
        if (projectPortal === 'tenant') {
          const names = await fetchTenantProjectClientNames().catch(() => [] as string[]);
          if (names.length > 0) return names;
          const projects = await fetchTenantProjects().catch(() => []);
          return [...new Set(projects.map((p) => p.clientName).filter(Boolean))].sort();
        }

        const names = await fetchProjectClientNames().catch(() => [] as string[]);
        if (names.length > 0) return names;
        const projects = await fetchProjects().catch(() => []);
        return [...new Set(projects.map((p) => p.clientName).filter(Boolean))].sort();
      };

      const [preview, names] = await Promise.all([
        projectPortal === 'tenant' ? previewTenantProjectName() : previewProjectName(),
        loadClientNames(),
      ]);
      setCpPreviewName(preview.name);
      setCpName(preview.name);
      setCpClientNames(names);
    } catch {
      // preview optional
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!cpClientName.trim() || !cpStartDate || !cpEndDate) return;
    setCpSaving(true);
    setCpError(null);
    try {
      const input = {
        clientName: cpClientName.trim(),
        name: cpName.trim() !== cpPreviewName ? cpName.trim() : undefined,
        description: cpDescription.trim() || undefined,
        startDate: cpStartDate,
        endDate: cpEndDate,
        enabledServices: ['create-vm' as const],
      };
      const created =
        projectPortal === 'tenant'
          ? await createTenantProject(input)
          : await createProject(input);
      setProjectId(created.id);
      setProjectRefreshKey((k) => k + 1);
      setCpOpen(false);
    } catch (err) {
      setCpError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setCpSaving(false);
    }
  }

  async function onBuyNow() {
    if (!selected) return;
    if (!configureValid) {
      setBuyError('Select a valid billing cycle for this template.');
      return;
    }
    if (softwareStepBlocked) return;

    const osLabel = OS_OPTIONS.find((o) => o.id === os)?.label || os;
    const preferredSoftwareIds = softwareMode === 'select' ? selectedSoftwareIds : [];

    setBuyLoading(true);
    setBuyError(null);
    try {
      await api.submitRequest({
        category: os,
        planId: selected._id,
        planName: selected.name,
        specs: {
          cpu: `${selected.vcpu} vCPU`,
          ram: `${selected.ramGb} GB`,
          disk: `${selected.ssdGb} GB SSD`,
        },
        billing,
        quantity: qty,
        template: {
          value: os,
          label: osLabel,
        },
        pricingSnapshot: {
          currency: selected.currency || 'INR',
          subtotal,
          tax,
          total,
          billingLabel: 'GST 18%',
        },
        ...(projectId ? { projectId } : {}),
        preferredSoftwareIds,
      });
      // Navigate to My VMs immediately — the request is queued (Provisioning)
      closeDrawer();
      router.push(routes.myVms);
    } catch (err) {
      setBuyError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to submit request'
      );
    } finally {
      setBuyLoading(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-screen-xl space-y-5 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create VM</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Choose a template, configure options, pick software on the next step, then buy.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">
            No templates published yet. Ask a super-admin to add Webyne plans.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">vCPU</th>
                <th className="px-4 py-3">RAM</th>
                <th className="px-4 py-3">SSD</th>
                {showHourly ? <th className="px-4 py-3">Hr</th> : null}
                <th className="px-4 py-3">Mon</th>
                <th className="px-4 py-3">QTr</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, index) => (
                <tr key={p._id} className="border-b border-gray-50 hover:bg-gray-50/80">
                  <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3">{p.vcpu}</td>
                  <td className="px-4 py-3">{p.ramGb}</td>
                  <td className="px-4 py-3">{p.ssdGb}</td>
                  {showHourly ? (
                    <td className="px-4 py-3 font-mono text-xs">{inr(priceForPeriod(p, 'hourly'))}</td>
                  ) : null}
                  <td className="px-4 py-3 font-mono text-xs">{inr(priceForPeriod(p, 'monthly'))}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {inr(priceForPeriod(p, 'quarterly'))}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{inr(priceForPeriod(p, 'yearly'))}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openPlan(p)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                {drawerStep === 'software' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerStep('configure');
                      setSoftwareSearch('');
                      setBuyError(null);
                    }}
                    disabled={buyLoading}
                    className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to configure
                  </button>
                ) : null}
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {drawerStep === 'configure' ? 'Step 1 · Configure' : 'Step 2 · Software'}
                </p>
                <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selected.vcpu} vCPU · {selected.ramGb} GB RAM · {selected.ssdGb} GB SSD
                </p>
              </div>
              <button type="button" onClick={closeDrawer} className="rounded-md p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {drawerStep === 'configure' ? (
                <>
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-900">1. Operating system</p>
                    <div className="flex flex-wrap gap-2">
                      {OS_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setOs(opt.id)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                            os === opt.id
                              ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-900">2. Billing cycle</p>
                    <div className="flex flex-wrap gap-2">
                      {availableBillings(selected, os).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setBilling(key)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                            billing === key
                              ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {BILLING_LABELS[key]} · {inr(priceForPeriod(selected, key, os))}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="mt-1 w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>

                  {!isSuperAdminCatalog ? (
                    <ProjectSelect
                      serviceKey="create-vm"
                      value={projectId}
                      onChange={setProjectId}
                      disabled={buyLoading}
                      portal={projectPortal}
                      onCreateProject={() => void openCpModal()}
                      refreshKey={projectRefreshKey}
                    />
                  ) : null}

                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-mono">{inr(subtotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-gray-600">
                      <span>GST 18%</span>
                      <span className="font-mono">{inr(tax)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                      <span>Total</span>
                      <span className="font-mono">{inr(total)}</span>
                    </div>
                  </div>

                  {buyError ? <p className="text-sm text-red-600">{buyError}</p> : null}
                </>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-sm font-medium text-gray-900">Software (optional)</p>
                    <p className="mb-2 text-xs text-gray-500">
                      Choose packages to install after the VM is ready, or skip. Only software
                      compatible with your step 1 OS is listed.
                    </p>
                    <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      Showing packages for{' '}
                      <span className="font-semibold">{vmOsLabel}</span>
                      {os === 'windows' ? ' (Chocolatey, Winget, MSI, etc.)' : ' (apt, scripts, zip)'}
                    </div>
                    <div className="space-y-2">
                      <label
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                          softwareMode === 'select'
                            ? 'border-[#B91C1C] bg-red-50/40'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="software-mode"
                          checked={softwareMode === 'select'}
                          onChange={() => setSoftwareMode('select')}
                          disabled={buyLoading}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            Select software to install
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            Installed via Racko agent after Super Admin attaches the VM.
                          </span>
                        </span>
                      </label>
                      <label
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                          softwareMode === 'skip'
                            ? 'border-[#B91C1C] bg-red-50/40'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="software-mode"
                          checked={softwareMode === 'skip'}
                          onChange={() => {
                            setSoftwareMode('skip');
                            setSelectedSoftwareIds([]);
                          }}
                          disabled={buyLoading}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            Skip software
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            You can install packages later from Machine Manager.
                          </span>
                        </span>
                      </label>
                    </div>

                    {softwareMode === 'select' ? (
                      <div className="mt-3 space-y-2">
                        <input
                          type="search"
                          value={softwareSearch}
                          onChange={(e) => setSoftwareSearch(e.target.value)}
                          placeholder="Search software…"
                          disabled={buyLoading}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#B91C1C] focus:ring-2 focus:ring-red-100"
                        />
                        {!softwareLoading && !softwareError && softwareForOs.length > 0 ? (
                          <p className="text-xs text-gray-500">
                            {softwareSearch.trim()
                              ? `${filteredSoftware.length} of ${softwareForOs.length} packages`
                              : `${softwareForOs.length} package${softwareForOs.length === 1 ? '' : 's'} available`}
                          </p>
                        ) : null}
                        {softwareLoading ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
                          </div>
                        ) : softwareError ? (
                          <p className="text-sm text-red-600">{softwareError}</p>
                        ) : filteredSoftware.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500">
                            {softwareSearch.trim()
                              ? 'No packages match your search.'
                              : `No ${vmOsLabel} packages in the catalog yet. Add them in Machine Manager → Software Catalog, or choose Skip software.`}
                          </p>
                        ) : (
                          <div className="max-h-[24rem] overflow-y-auto pr-1">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredSoftware.map((sw) => {
                              const sel = selectedSoftwareIds.includes(sw._id);
                              const showImage = Boolean(sw.iconUrl) && !brokenSoftwareIconIds.has(sw._id);
                              return (
                                <button
                                  key={sw._id}
                                  type="button"
                                  disabled={buyLoading}
                                  onClick={() => toggleSoftware(sw._id)}
                                  className={`w-full rounded-xl border p-3 text-left transition ${
                                    sel
                                      ? 'border-[#B91C1C] bg-red-50 ring-1 ring-[#B91C1C] shadow-sm'
                                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    {showImage ? (
                                      <img
                                        src={sw.iconUrl}
                                        alt={softwareIconAlt(sw.name)}
                                        onError={() => {
                                          setBrokenSoftwareIconIds((prev) => {
                                            if (prev.has(sw._id)) return prev;
                                            const next = new Set(prev);
                                            next.add(sw._id);
                                            return next;
                                          });
                                        }}
                                        className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-1"
                                      />
                                    ) : (
                                      <div
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${softwareIconTone(sw.name)}`}
                                        aria-hidden="true"
                                      >
                                        {softwareMonogram(sw.name)}
                                      </div>
                                    )}
                                    {sel ? (
                                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B91C1C]">
                                        <Check className="h-3 w-3 text-white" />
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="mt-3">
                                    <div>
                                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">{sw.name}</p>
                                      <p className="mt-0.5 text-xs text-gray-500">
                                        v{sw.version} · {sw.installMethod}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                            </div>
                          </div>
                        )}
                        {selectedSoftwareIds.length > 0 ? (
                          <p className="text-xs text-gray-500">
                            {selectedSoftwareIds.length} package
                            {selectedSoftwareIds.length === 1 ? '' : 's'} selected
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-mono">{inr(subtotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-gray-600">
                      <span>GST 18%</span>
                      <span className="font-mono">{inr(tax)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                      <span>Total</span>
                      <span className="font-mono">{inr(total)}</span>
                    </div>
                  </div>

                  {buyError ? <p className="text-sm text-red-600">{buyError}</p> : null}
                </>
              )}
            </div>

            <div className="border-t px-5 py-4">
              {drawerStep === 'configure' ? (
                <button
                  type="button"
                  disabled={!configureValid || buyLoading}
                  onClick={goToSoftwareStep}
                  className="w-full rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={
                      buyLoading ||
                      total <= 0 ||
                      softwareStepBlocked
                    }
                    onClick={() => void onBuyNow()}
                    className="w-full rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {buyLoading ? 'Submitting…' : `Buy Now · ${inr(total)}`}
                  </button>
                  {softwareStepBlocked ? (
                    <p className="mt-2 text-center text-xs text-gray-500">
                      Select at least one package, or choose Skip software.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Create project modal */}
      {cpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
          role="dialog" aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !cpSaving) setCpOpen(false); }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">Create Project</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">Create New Project</h2>
                <p className="mt-1 text-sm text-gray-500">Set up a new project to organize and manage your cloud resources.</p>
              </div>
              <button type="button" disabled={cpSaving} onClick={() => setCpOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void handleCreateProject(e)}>
              <div className="p-5">
                {cpError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cpError}</div>
                )}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">Project Information</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Project Name <span className="text-red-500">*</span></label>
                      <input className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpName} onChange={(e) => setCpName(e.target.value)} required placeholder={cpPreviewName || 'Auto-generated'} />
                      <p className="mt-1 text-[11px] text-gray-400">A unique name to identify your project.</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Client Name <span className="text-red-500">*</span></label>
                      <ClientNameCombobox
                        value={cpClientName}
                        onChange={setCpClientName}
                        clientNames={cpClientNames}
                        required
                        disabled={cpSaving}
                        placeholder="e.g. Acme Corp"
                      />
                      <p className="mt-1 text-[11px] text-gray-400">The client this project belongs to.</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-gray-700">Description <span className="font-normal text-gray-400">(Optional)</span></label>
                      <span className="text-[11px] text-gray-400">{cpDescription.length} / 500</span>
                    </div>
                    <textarea className="mt-1.5 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                      rows={3} value={cpDescription} onChange={(e) => setCpDescription(e.target.value.slice(0, 500))}
                      placeholder="Describe the purpose and workloads for this project." />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">Start Date <span className="text-red-500">*</span></label>
                      <input type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpStartDate} onChange={(e) => setCpStartDate(e.target.value)} max={cpEndDate || undefined} required />
                      <p className="mt-1 text-[11px] text-gray-400">When does this project start?</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-700">End Date <span className="text-red-500">*</span></label>
                      <input type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]"
                        value={cpEndDate} onChange={(e) => setCpEndDate(e.target.value)} min={cpStartDate || undefined} required />
                      <p className="mt-1 text-[11px] text-gray-400">When does this project end?</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <button type="button" disabled={cpSaving} onClick={() => setCpOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={cpSaving || !cpClientName.trim() || !cpStartDate || !cpEndDate}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60">
                  {cpSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
