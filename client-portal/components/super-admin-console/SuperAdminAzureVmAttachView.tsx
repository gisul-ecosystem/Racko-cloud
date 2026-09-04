'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Cloud, Loader2, Search, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createAzureCatalogVm,
  fetchAzurePlacementOptions,
  fetchAzureProvisionReady,
  fetchAzureLocations,
  registerManualAzureCatalogVm,
  searchAzureCustomImages,
  validateAzureCustomImage,
  validateAzureVmImage,
  validateAzureProvisionQuote,
  type AzureCustomImageOption,
  type AzureLocationOption,
  type AzurePlacementOption,
  type AzureProvisionQuoteValidation,
  type AzureProvisionReadyStatus,
  type AzureVmImageOption,
} from '@/lib/vmCatalogApi';
import { AzureVmImageSelectPanel } from '@/components/super-admin-console/AzureVmImageSelectPanel';
import {
  fetchProjectsForAdmin,
  fetchProjectsForTenant,
  type OrgProject,
} from '@/lib/projectsApi';
import {
  fetchSuperAdminExternalVmTargets,
  type SuperAdminTargetOption,
} from '@/lib/superAdminExternalVmApi';
import { ToastContainer, useToast } from '@/components/ui/Toast';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const sectionTitleClass = 'text-sm font-semibold uppercase tracking-wide text-gray-900';

type OwnerMode = 'admin' | 'tenant';
type PageTab = 'create' | 'register';
type CreateWizardStep = 1 | 2 | 3 | 4;

const CREATE_WIZARD_STEPS: Array<{ step: CreateWizardStep; label: string }> = [
  { step: 1, label: 'Project' },
  { step: 2, label: 'Spec' },
  { step: 3, label: 'Image & OS' },
  { step: 4, label: 'Review' },
];

function placementRowKey(opt: AzurePlacementOption): string {
  return `${opt.region}|${opt.vmSize}`;
}

/** Collapse Standard_NV16as_v4 / Standard_NV32as_v4 → same series key for family filtering. */
function vmSizeSeriesKey(vmSize: string): string {
  return String(vmSize || '')
    .replace(/^Standard_/i, '')
    .replace(/\d+/g, '#')
    .toLowerCase();
}

function formatPlacementSpec(opt: AzurePlacementOption): string {
  const parts = [`${opt.vcpu} vCPU`, `${opt.memoryGb} GB`];
  const gpuCount = Number(opt.gpuCount) || 0;
  if (gpuCount > 0 || opt.gpu) {
    parts.push(gpuCount > 1 ? `${gpuCount} GPU` : 'GPU');
  } else if (/^Standard_N/i.test(opt.vmSize || '')) {
    parts.push('GPU');
  }
  return parts.join(' · ');
}

function placementMatchesExcludedFamily(
  opt: AzurePlacementOption,
  excludedFamilies: string[],
  excludedSeriesKeys: string[]
): boolean {
  const fam = String(opt.family || '').trim().toLowerCase();
  if (fam && excludedFamilies.some((f) => f === fam)) return true;
  const series = vmSizeSeriesKey(opt.vmSize);
  if (series && excludedSeriesKeys.some((s) => s === series)) return true;
  return false;
}

const WIZARD_ACCENT = '#B91C1C';

interface PickerOption {
  id: string;
  label: string;
  searchText: string;
}

function toPickerOptions(
  rows: SuperAdminTargetOption[],
  mode: OwnerMode
): PickerOption[] {
  return rows.map((row) => ({
    id: row.id,
    label: mode === 'tenant' ? row.label || row.name || row.id : row.email || row.label || row.id,
    searchText: [row.label, row.name, row.email, row.slug, row.id].filter(Boolean).join(' ').toLowerCase(),
  }));
}

function OwnerPicker({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.searchText.includes(q)).slice(0, 50);
  }, [options, query]);

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          className={`${inputClass} pl-9`}
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
        />
      </div>
      <select
        className={`${inputClass} mt-2`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select…</option>
        {filtered.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CreateVmStepper({ step }: { step: CreateWizardStep }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-y-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-4">
      {CREATE_WIZARD_STEPS.map(({ step: s, label }, idx) => (
        <div key={s} className="flex items-center">
          {idx > 0 ? (
            <ChevronRight className="mx-1.5 hidden h-3.5 w-3.5 shrink-0 text-gray-300 sm:block" />
          ) : null}
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                step >= s ? 'text-white' : 'bg-gray-200 text-gray-500'
              }`}
              style={step >= s ? { backgroundColor: WIZARD_ACCENT } : undefined}
            >
              {step > s ? <Check className="h-4 w-4" /> : s}
            </div>
            <span
              className={`text-sm font-medium ${
                step === s ? 'text-gray-900' : step > s ? 'text-gray-700' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches backend projectAzureResourceGroupName — preview for UI before create. */
function previewProjectAzureResourceGroup(project: OrgProject | null | undefined): string | undefined {
  if (!project) return undefined;
  const candidate = (project.name?.trim() || project.autoGeneratedName?.trim()) ?? '';
  if (!candidate) return undefined;
  let s = candidate
    .replace(/\.$/, '')
    .replace(/[^A-Za-z0-9-_.()]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s || undefined;
}

export function SuperAdminAzureVmAttachView() {
  const router = useRouter();
  const { toasts, addToast, dismiss } = useToast();

  const [pageTab, setPageTab] = useState<PageTab>('create');
  const [createStep, setCreateStep] = useState<CreateWizardStep>(1);
  const [provisionReady, setProvisionReady] = useState<AzureProvisionReadyStatus | null>(null);

  const [targets, setTargets] = useState<{ admins: SuperAdminTargetOption[]; tenants: SuperAdminTargetOption[] }>({
    admins: [],
    tenants: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [resourceGroup, setResourceGroup] = useState('');
  const [vmName, setVmName] = useState('');
  const [region, setRegion] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [hostname, setHostname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [protocol, setProtocol] = useState<'rdp' | 'ssh'>('ssh');
  const [osCategory, setOsCategory] = useState('');
  const [catalogTemplate, setCatalogTemplate] = useState('');
  const [attachNow, setAttachNow] = useState(true);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>('admin');
  const [ownerId, setOwnerId] = useState('');

  const [createOwnerMode, setCreateOwnerMode] = useState<OwnerMode>('admin');
  const [createOwnerId, setCreateOwnerId] = useState('');
  const [createProjects, setCreateProjects] = useState<OrgProject[]>([]);
  const [createProjectId, setCreateProjectId] = useState('');
  const [createPlanLabel, setCreatePlanLabel] = useState('');
  const [createVcpu, setCreateVcpu] = useState('');
  const [createRamGb, setCreateRamGb] = useState('');
  const [createSsdGb, setCreateSsdGb] = useState('50');
  const [needsGpu, setNeedsGpu] = useState(false);
  const [createOsType, setCreateOsType] = useState<'linux' | 'windows'>('windows');
  const [imageSourceMode, setImageSourceMode] = useState<'marketplace' | 'custom'>('marketplace');
  const [selectedMarketplaceImage, setSelectedMarketplaceImage] =
    useState<AzureVmImageOption | null>(null);
  const [azureLocations, setAzureLocations] = useState<AzureLocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [selectedCustomTemplate, setSelectedCustomTemplate] =
    useState<AzureCustomImageOption | null>(null);
  const [customTemplateOptions, setCustomTemplateOptions] = useState<AzureCustomImageOption[]>([]);
  const [customTemplateLoading, setCustomTemplateLoading] = useState(false);
  const [customTemplateLoadError, setCustomTemplateLoadError] = useState<string | null>(null);
  const [specValidation, setSpecValidation] = useState<{ ok?: boolean; message?: string } | null>(
    null
  );
  const [imageValidation, setImageValidation] = useState<{ ok?: boolean; message?: string } | null>(
    null
  );
  const [nestedVirtualization, setNestedVirtualization] = useState(false);
  const [assignPublicIp, setAssignPublicIp] = useState(false);
  const [createAttachNow, setCreateAttachNow] = useState(true);
  const [placementOptions, setPlacementOptions] = useState<AzurePlacementOption[]>([]);
  const [selectedPlacementKey, setSelectedPlacementKey] = useState('');
  const [placementMeta, setPlacementMeta] = useState<{
    homeRegion?: string;
    regionMode?: 'home' | 'auto';
    assignPublicIp?: boolean;
    recommended?: AzurePlacementOption | null;
    message?: string;
    series?: string[];
  } | null>(null);
  const [placementSeriesFilter, setPlacementSeriesFilter] = useState<string>('all');
  const [canonicalSpec, setCanonicalSpec] = useState('');
  const [loadingPlacementOptions, setLoadingPlacementOptions] = useState(false);
  const [placementOptionsError, setPlacementOptionsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [checkingQuote, setCheckingQuote] = useState(false);
  const [quoteCheck, setQuoteCheck] = useState<AzureProvisionQuoteValidation | null>(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [excludedQuotaFamilies, setExcludedQuotaFamilies] = useState<string[]>([]);
  const [excludedVmSeriesKeys, setExcludedVmSeriesKeys] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const placementListRef = useRef<HTMLDivElement | null>(null);
  const excludedQuotaFamiliesRef = useRef<string[]>([]);
  const excludedVmSeriesKeysRef = useRef<string[]>([]);
  excludedQuotaFamiliesRef.current = excludedQuotaFamilies;
  excludedVmSeriesKeysRef.current = excludedVmSeriesKeys;

  const imageBrowseRegion = useMemo(
    () =>
      provisionReady?.catalogBrowseRegion?.trim() ||
      provisionReady?.defaultLocation?.trim() ||
      provisionReady?.homeLocation?.trim() ||
      '',
    [provisionReady]
  );

  const homeLocationLabel = useMemo(() => {
    const home =
      provisionReady?.homeLocation?.trim() ||
      provisionReady?.defaultLocation?.trim() ||
      '';
    if (!home) return 'home region';
    const match = azureLocations.find((loc) => loc.name === home);
    return match ? `${match.displayName} (${home})` : home;
  }, [azureLocations, provisionReady?.defaultLocation, provisionReady?.homeLocation]);

  const imageBrowseRegionLabel = useMemo(() => {
    const match = azureLocations.find((loc) => loc.name === imageBrowseRegion);
    return match ? `${match.displayName} (${match.name})` : imageBrowseRegion;
  }, [azureLocations, imageBrowseRegion]);

  const ownerOptions = useMemo(
    () => toPickerOptions(ownerMode === 'admin' ? targets.admins : targets.tenants, ownerMode),
    [ownerMode, targets.admins, targets.tenants]
  );

  const createOwnerOptions = useMemo(
    () =>
      toPickerOptions(
        createOwnerMode === 'admin' ? targets.admins : targets.tenants,
        createOwnerMode
      ),
    [createOwnerMode, targets.admins, targets.tenants]
  );

  const selectedProject = useMemo(
    () => createProjects.find((p) => p.id === createProjectId) ?? null,
    [createProjects, createProjectId]
  );

  const projectVmResourceGroup = useMemo(
    () => previewProjectAzureResourceGroup(selectedProject),
    [selectedProject]
  );

  const createCategory = useMemo(() => {
    if (needsGpu) return 'gpu';
    if (imageSourceMode === 'custom' && selectedCustomTemplate?.osType) {
      return /windows/i.test(selectedCustomTemplate.osType) ? 'windows' : 'linux';
    }
    if (imageSourceMode === 'marketplace' && selectedMarketplaceImage) {
      const blob = [
        selectedMarketplaceImage.publisher,
        selectedMarketplaceImage.offer,
        selectedMarketplaceImage.label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (/windows|windowsserver/.test(blob)) return 'windows';
    }
    return createOsType;
  }, [needsGpu, createOsType, imageSourceMode, selectedCustomTemplate, selectedMarketplaceImage]);

  const defaultOsLabel = useMemo(
    () =>
      createOsType === 'windows'
        ? 'Default Azure Windows Server image'
        : 'Default Azure Linux image (from reseller env)',
    [createOsType]
  );

  const createRegion = useMemo(() => {
    if (!selectedPlacementKey) return '';
    const [region] = selectedPlacementKey.split('|');
    return region ?? '';
  }, [selectedPlacementKey]);

  const selectedVmSize = useMemo(() => {
    if (!selectedPlacementKey) return '';
    const parts = selectedPlacementKey.split('|');
    return parts[1] ?? '';
  }, [selectedPlacementKey]);

  const createRegionLabel = useMemo(() => {
    const match = azureLocations.find((loc) => loc.name === createRegion);
    return match ? `${match.displayName} (${match.name})` : createRegion;
  }, [azureLocations, createRegion]);

  const customTemplatesInRegion = customTemplateOptions;

  const imageReady = useMemo(() => {
    if (!imageValidation?.ok) return false;
    if (imageSourceMode === 'marketplace') {
      return Boolean(selectedMarketplaceImage);
    }
    return Boolean(selectedCustomTemplate?.id);
  }, [imageValidation, imageSourceMode, selectedMarketplaceImage, selectedCustomTemplate]);

  const selectedPlacementOption = useMemo(
    () =>
      placementOptions.find((opt) => placementRowKey(opt) === selectedPlacementKey) ?? null,
    [placementOptions, selectedPlacementKey]
  );

  const placementSeriesList = useMemo(() => {
    if (placementMeta?.series?.length) return placementMeta.series;
    const set = new Set<string>();
    for (const opt of placementOptions) {
      const label = String(opt.series || '').trim();
      if (label) set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [placementMeta?.series, placementOptions]);

  const filteredPlacementOptions = useMemo(() => {
    if (placementSeriesFilter === 'all') return placementOptions;
    return placementOptions.filter(
      (opt) => String(opt.series || '').trim() === placementSeriesFilter
    );
  }, [placementOptions, placementSeriesFilter]);

  const refreshData = useCallback(async () => {
    const [targetRows, readyStatus] = await Promise.all([
      fetchSuperAdminExternalVmTargets(),
      fetchAzureProvisionReady().catch(() => ({ ready: false, message: 'Could not reach reseller.' })),
    ]);
    setTargets(targetRows);
    setProvisionReady(readyStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectsForCreate() {
      if (!createOwnerId) {
        setCreateProjects([]);
        setCreateProjectId('');
        setProjectsLoading(false);
        return;
      }

      setProjectsLoading(true);
      try {
        const rows =
          createOwnerMode === 'admin'
            ? await fetchProjectsForAdmin(createOwnerId)
            : await fetchProjectsForTenant(createOwnerId);
        if (!cancelled) {
          setCreateProjects(rows);
          setCreateProjectId((current) =>
            current && rows.some((p) => p.id === current) ? current : rows[0]?.id ?? ''
          );
        }
      } catch (err) {
        if (!cancelled) {
          addToast(
            'error',
            err instanceof ApiError ? err.message : 'Failed to load projects for customer.'
          );
          setCreateProjects([]);
          setCreateProjectId('');
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }

    void loadProjectsForCreate();
    return () => {
      cancelled = true;
    };
  }, [createOwnerMode, createOwnerId, addToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      try {
        await refreshData();
      } catch (err) {
        if (!cancelled) {
          addToast(
            'error',
            err instanceof ApiError ? err.message : 'Failed to load Azure VM catalog data.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
    // Initial load only — refreshData is stable; addToast intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const os = osCategory.trim().toLowerCase();
    if (os.includes('windows')) {
      setProtocol('rdp');
      setUsername((current) => current || 'Administrator');
    } else if (os) {
      setProtocol('ssh');
    }
  }, [osCategory]);

  const clearPlacement = useCallback(() => {
    setPlacementOptions([]);
    setSelectedPlacementKey('');
    setPlacementMeta(null);
    setCanonicalSpec('');
    setPlacementOptionsError(null);
    setSpecValidation(null);
    setQuoteCheck(null);
    setQuoteModalOpen(false);
    setExcludedQuotaFamilies([]);
    setExcludedVmSeriesKeys([]);
  }, []);

  const clearImageSelection = useCallback(() => {
    setSelectedMarketplaceImage(null);
    setSelectedCustomTemplate(null);
    setImageValidation(null);
    clearPlacement();
  }, [clearPlacement]);

  useEffect(() => {
    let cancelled = false;
    setLocationsLoading(true);
    setLocationsError(null);
    void fetchAzureLocations()
      .then((rows) => {
        if (cancelled) return;
        setAzureLocations(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLocationsError(
          err instanceof ApiError ? err.message : 'Could not load Azure regions.'
        );
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const searchCustomTemplates = useCallback(async (query: string) => {
    setCustomTemplateLoading(true);
    setCustomTemplateLoadError(null);
    try {
      const rows = await searchAzureCustomImages(query, 50);
      setCustomTemplateOptions(rows);
      if (rows.length === 0 && !query.trim()) {
        setCustomTemplateLoadError(
          'No custom templates found in this subscription (or check AZURE_TEMPLATE_RESOURCE_GROUP).'
        );
      }
    } catch (err) {
      setCustomTemplateOptions([]);
      setCustomTemplateLoadError(
        err instanceof ApiError
          ? err.message
          : 'Could not load custom templates from Azure. Check reseller Azure credentials.'
      );
    } finally {
      setCustomTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    const vcpu = Number(createVcpu);
    const ramGb = Number(createRamGb);
    const ssdGb = Number(createSsdGb);
    const specValid =
      Number.isFinite(vcpu) &&
      vcpu >= 1 &&
      Number.isFinite(ramGb) &&
      ramGb >= 1 &&
      Number.isFinite(ssdGb) &&
      ssdGb >= 8;

    if (createStep !== 4 || !specValid || !imageReady) {
      return;
    }

    const customRegion =
      imageSourceMode === 'custom' ? selectedCustomTemplate?.location?.trim() : '';

    setLoadingPlacementOptions(true);
    setQuoteCheck(null);
    setQuoteModalOpen(false);

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setPlacementOptionsError(null);
        try {
          const result = await fetchAzurePlacementOptions({
            category: createCategory,
            vcpu,
            ramGb,
            ssdGb,
            ...(customRegion ? { region: customRegion } : {}),
            ...(imageSourceMode === 'marketplace' && selectedMarketplaceImage
              ? {
                  imagePublisher: selectedMarketplaceImage.publisher,
                  imageOffer: selectedMarketplaceImage.offer,
                  imageSku: selectedMarketplaceImage.sku,
                }
              : {}),
            nestedVirtualization,
            assignPublicIp,
          });
          if (cancelled) return;

          const families = excludedQuotaFamiliesRef.current;
          const seriesKeys = excludedVmSeriesKeysRef.current;
          const filteredOptions = result.options.filter(
            (opt) => !placementMatchesExcludedFamily(opt, families, seriesKeys)
          );
          const recommended =
            filteredOptions.find((opt) =>
              result.recommended
                ? placementRowKey(opt) === placementRowKey(result.recommended)
                : false
            ) ??
            filteredOptions[0] ??
            null;

          setPlacementOptions(filteredOptions);
          setPlacementSeriesFilter('all');
          setCanonicalSpec(result.canonicalSpec);
          const seriesFromOptions = [
            ...new Set(
              filteredOptions
                .map((opt) => String(opt.series || '').trim())
                .filter(Boolean)
            ),
          ].sort((a, b) => a.localeCompare(b));
          setPlacementMeta({
            homeRegion: result.homeRegion,
            regionMode: result.regionMode,
            assignPublicIp: result.assignPublicIp,
            recommended,
            series: result.series?.length ? result.series : seriesFromOptions,
            message:
              filteredOptions.length < result.options.length && families.length > 0
                ? `Hidden ${result.options.length - filteredOptions.length} option(s) from excluded quota families (${families.join(', ')}).`
                : result.message,
          });

          if (filteredOptions.length > 0 && recommended) {
            setSelectedPlacementKey(placementRowKey(recommended));
            const regionLabel =
              azureLocations.find((loc) => loc.name === recommended.region)?.displayName ??
              recommended.region;
            const seriesHint =
              recommended.series || seriesFromOptions.length > 1
                ? ` · ${seriesFromOptions.length} series`
                : '';
            setSpecValidation({
              ok: true,
              message:
                result.regionMode === 'auto'
                  ? `Recommended: ${recommended.vmSize}${recommended.series ? ` (${recommended.series})` : ''} in ${regionLabel} ($${recommended.estimatedHourlyUsd.toFixed(4)}/hr) — cheapest${seriesHint}`
                  : customRegion
                    ? `${filteredOptions.length} option${filteredOptions.length === 1 ? '' : 's'} in ${regionLabel} (custom image region)`
                    : `Recommended: ${recommended.vmSize}${recommended.series ? ` (${recommended.series})` : ''} in ${regionLabel} ($${recommended.estimatedHourlyUsd.toFixed(4)}/hr) — home region (${result.homeRegion || homeLocationLabel})${seriesHint}`,
            });
          } else {
            setSelectedPlacementKey('');
            setSpecValidation({
              ok: false,
              message:
                filteredOptions.length === 0 && result.options.length > 0
                  ? 'All matching sizes are in excluded quota families. Go back to Spec and change vCPU/RAM (or GPU) to see other families.'
                  : result.message || 'No priced region/VM size combinations for this spec.',
            });
          }
        } catch (err) {
          if (!cancelled) {
            setPlacementOptions([]);
            setSelectedPlacementKey('');
            setPlacementMeta(null);
            setCanonicalSpec('');
            setPlacementOptionsError(
              err instanceof ApiError
                ? err.status === 504 || err.status === 500 || err.status === 503
                  ? `${err.message}${err.status === 503 ? '' : ' Pricing can take 1–2 minutes on first load — retry, or check that core-api and cloud_automation_reseller are running.'}`
                  : err.message
                : 'Failed to load placement options.'
            );
            setSpecValidation({ ok: false, message: 'Could not load placement options.' });
          }
        } finally {
          if (!cancelled) setLoadingPlacementOptions(false);
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    createStep,
    createVcpu,
    createRamGb,
    createSsdGb,
    createCategory,
    imageReady,
    imageSourceMode,
    selectedCustomTemplate?.location,
    selectedMarketplaceImage,
    nestedVirtualization,
    assignPublicIp,
    azureLocations,
    homeLocationLabel,
  ]);

  function parseSpecInputs() {
    const vcpu = Number(createVcpu);
    const ramGb = Number(createRamGb);
    const ssdGb = Number(createSsdGb);
    return { vcpu, ramGb, ssdGb };
  }

  function requireSpecInputs(): boolean {
    const { vcpu, ramGb, ssdGb } = parseSpecInputs();
    if (!Number.isFinite(vcpu) || vcpu < 1) {
      addToast('error', 'Enter a valid vCPU count.');
      return false;
    }
    if (!Number.isFinite(ramGb) || ramGb < 1) {
      addToast('error', 'Enter valid RAM (GB).');
      return false;
    }
    if (!Number.isFinite(ssdGb) || ssdGb < 8) {
      addToast('error', 'Enter disk size (minimum 8 GB).');
      return false;
    }
    return true;
  }

  function canProceedCreateStep1(): boolean {
    return Boolean(createOwnerId && createProjectId);
  }

  function canProceedCreateStep2(): boolean {
    const { vcpu, ramGb, ssdGb } = parseSpecInputs();
    return (
      Number.isFinite(vcpu) &&
      vcpu >= 1 &&
      Number.isFinite(ramGb) &&
      ramGb >= 1 &&
      Number.isFinite(ssdGb) &&
      ssdGb >= 8
    );
  }

  function canProceedCreateStep3(): boolean {
    return imageReady;
  }

  function canProceedCreateStep4(): boolean {
    return Boolean(selectedPlacementKey && !loadingPlacementOptions);
  }

  async function handleCheckQuote() {
    if (!selectedPlacementOption || !selectedVmSize || !createRegion) {
      addToast('error', 'Select a region and VM size first.');
      return;
    }
    if (!requireSpecInputs()) return;

    const { vcpu, ramGb, ssdGb } = parseSpecInputs();
    setCheckingQuote(true);
    setQuoteCheck(null);
    setQuoteModalOpen(true);
    try {
      const result = await validateAzureProvisionQuote({
        vmSize: selectedVmSize,
        region: createRegion,
        category: createCategory,
        vcpu,
        ramGb,
        ssdGb,
        nestedVirtualization,
        assignPublicIp,
        ...(imageSourceMode === 'custom' && selectedCustomTemplate?.id
          ? { customImageId: selectedCustomTemplate.id }
          : {}),
        ...(imageSourceMode === 'marketplace' && selectedMarketplaceImage
          ? {
              imagePublisher: selectedMarketplaceImage.publisher,
              imageOffer: selectedMarketplaceImage.offer,
              imageSku: selectedMarketplaceImage.sku,
            }
          : {}),
      });
      setQuoteCheck(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not check quote.';
      setQuoteCheck({ valid: false, message });
    } finally {
      setCheckingQuote(false);
    }
  }

  function handleUseAnotherVmSize() {
    const failedFamily = String(quoteCheck?.quota?.family || selectedPlacementOption?.family || '')
      .trim()
      .toLowerCase();
    const failedSeries = selectedVmSize ? vmSizeSeriesKey(selectedVmSize) : '';

    const nextFamilies = failedFamily
      ? Array.from(new Set([...excludedQuotaFamilies, failedFamily]))
      : excludedQuotaFamilies;
    const nextSeries = failedSeries
      ? Array.from(new Set([...excludedVmSeriesKeys, failedSeries]))
      : excludedVmSeriesKeys;

    setExcludedQuotaFamilies(nextFamilies);
    setExcludedVmSeriesKeys(nextSeries);

    const remaining = placementOptions.filter(
      (opt) => !placementMatchesExcludedFamily(opt, nextFamilies, nextSeries)
    );

    setQuoteModalOpen(false);
    setQuoteCheck(null);
    setSelectedPlacementKey('');
    setPlacementOptions(remaining);
    setPlacementSeriesFilter('all');
    const remainingSeries = [
      ...new Set(remaining.map((opt) => String(opt.series || '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    const nextRecommended = remaining[0] ?? null;
    setPlacementMeta((prev) =>
      prev
        ? {
            ...prev,
            recommended: nextRecommended,
            series: remainingSeries,
            message: failedFamily
              ? `Removed ${failedFamily} options (no quota). Pick a different series — cheapest remaining is selected.`
              : 'Previous size is unavailable for quota. Pick another VM size or region.',
          }
        : prev
    );
    if (nextRecommended) {
      setSelectedPlacementKey(placementRowKey(nextRecommended));
    }
    setSpecValidation(
      remaining.length > 0
        ? {
            ok: true,
            message: nextRecommended
              ? `Switched to cheapest remaining: ${nextRecommended.vmSize}${nextRecommended.series ? ` (${nextRecommended.series})` : ''} — $${nextRecommended.estimatedHourlyUsd.toFixed(4)}/hr`
              : 'Pick another VM size or region.',
          }
        : {
            ok: false,
            message:
              'No other series left after excluding this family. Go back to Spec and change vCPU/RAM (or GPU).',
          }
    );

    window.setTimeout(() => {
      placementListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  async function goToCreateStep(next: CreateWizardStep) {
    if (next === 2 && !canProceedCreateStep1()) {
      addToast('error', 'Select a customer and project.');
      return;
    }
    if (next === 3 && !canProceedCreateStep2()) {
      requireSpecInputs();
      return;
    }
    if (next === 4) {
      if (!canProceedCreateStep3()) {
        addToast('error', 'Select and validate an image before continuing.');
        return;
      }
      const imageOk = await validateCreateImage();
      if (!imageOk) return;
    }
    setCreateStep(next);
  }

  async function validateCreateSpec() {
    if (!requireSpecInputs()) return false;

    if (selectedVmSize && selectedPlacementOption) {
      setSpecValidation({
        ok: true,
        message: `${selectedVmSize} in ${createRegionLabel}`,
      });
      return true;
    }
    setSpecValidation({
      ok: false,
      message: loadingPlacementOptions
        ? 'Loading VM sizes…'
        : 'Select a VM size that matches your spec.',
    });
    return false;
  }

  async function validateCreateImage() {
    if (imageSourceMode === 'marketplace') {
      if (!selectedMarketplaceImage) {
        setImageValidation({ ok: false, message: 'Select an Azure marketplace image.' });
        return false;
      }

      try {
        const result = await validateAzureVmImage({
          publisher: selectedMarketplaceImage.publisher,
          offer: selectedMarketplaceImage.offer,
          sku: selectedMarketplaceImage.sku,
        });
        if (result.valid) {
          setImageValidation({ ok: true, message: result.label || selectedMarketplaceImage.label });
          return true;
        }
        setImageValidation({ ok: false, message: result.message || 'Invalid marketplace image.' });
        return false;
      } catch (err) {
        setImageValidation({
          ok: false,
          message: err instanceof ApiError ? err.message : 'Could not validate marketplace image.',
        });
        return false;
      }
    }

    if (!selectedCustomTemplate?.id) {
      setImageValidation({ ok: false, message: 'Select one of your Azure templates.' });
      return false;
    }

    try {
      const customRegion = selectedCustomTemplate.location?.trim() || '';
      const result = await validateAzureCustomImage({
        imageId: selectedCustomTemplate.id,
        ...(customRegion ? { region: customRegion } : {}),
      });
      if (result.valid) {
        setImageValidation({ ok: true, message: result.label || selectedCustomTemplate.label });
        return true;
      }
      setImageValidation({ ok: false, message: result.message || 'Invalid custom template.' });
      return false;
    } catch (err) {
      setImageValidation({
        ok: false,
        message: err instanceof ApiError ? err.message : 'Could not validate custom template.',
      });
      return false;
    }
  }

  async function handleCreateVm(e: React.FormEvent) {
    e.preventDefault();
    if (!createOwnerId || !createProjectId) {
      addToast('error', 'Select customer and project.');
      return;
    }
    if (!provisionReady?.ready) {
      addToast('error', provisionReady?.message || 'Azure provisioning is not configured on reseller.');
      return;
    }

    if (!selectedPlacementKey || !selectedPlacementOption) {
      addToast('error', 'Select a region and VM size from the placement table.');
      return;
    }

    if (!quoteCheck?.valid) {
      addToast('error', 'Run Check quote successfully before creating the VM.');
      return;
    }

    const specOk = await validateCreateSpec();
    const imageOk = await validateCreateImage();
    if (!specOk || !imageOk) return;

    const { vcpu, ramGb, ssdGb } = parseSpecInputs();

    setCreating(true);
    try {
      await createAzureCatalogVm({
        ownerType: createOwnerMode,
        ownerId: createOwnerId,
        projectId: createProjectId,
        category: createCategory,
        catalogTemplate: createPlanLabel.trim() || canonicalSpec,
        osCategory:
          imageSourceMode === 'custom'
            ? selectedCustomTemplate?.label || 'Custom template'
            : selectedMarketplaceImage?.label || defaultOsLabel,
        vmSize: selectedVmSize,
        vcpu,
        ramGb,
        ssdGb,
        canonicalSpec: canonicalSpec || undefined,
        nestedVirtualization,
        attachNow: createAttachNow,
        assignPublicIp,
        ...(imageSourceMode === 'custom' && selectedCustomTemplate?.id
          ? { customImageId: selectedCustomTemplate.id }
          : {}),
        ...(imageSourceMode === 'marketplace' && selectedMarketplaceImage
          ? {
              imagePublisher: selectedMarketplaceImage.publisher,
              imageOffer: selectedMarketplaceImage.offer,
              imageSku: selectedMarketplaceImage.sku,
            }
          : {}),
        region: createRegion,
      });
      addToast(
        'success',
        createAttachNow
          ? 'Azure VM provisioning started — it will attach when ready.'
          : 'Azure VM provisioning started — check Azure VMs for status.'
      );
      clearPlacement();
      setCreateStep(1);
      router.push('/super-admin-console/create-vm/azure/vms');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to create Azure VM.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!osCategory.trim()) {
      addToast('error', 'Enter an OS category.');
      return;
    }
    if (!catalogTemplate.trim()) {
      addToast('error', 'Enter a catalog template label.');
      return;
    }
    if (attachNow && !ownerId) {
      addToast('error', 'Select a customer to attach this VM to.');
      return;
    }

    setSubmitting(true);
    try {
      await registerManualAzureCatalogVm({
        resourceGroup: resourceGroup.trim(),
        vmName: vmName.trim(),
        region: region.trim(),
        ipAddress: ipAddress.trim(),
        hostname: hostname.trim() || undefined,
        username: username.trim(),
        password,
        protocol,
        osCategory: osCategory.trim(),
        catalogTemplate: catalogTemplate.trim(),
        subscriptionId: subscriptionId.trim() || undefined,
        attachNow,
        ...(attachNow ? { ownerType: ownerMode, ownerId } : {}),
      });
      addToast(
        'success',
        attachNow
          ? 'Azure VM registered and attached to customer.'
          : 'Azure VM registered — assign it from Azure VMs.'
      );
      setResourceGroup('');
      setVmName('');
      setRegion('');
      setSubscriptionId('');
      setIpAddress('');
      setHostname('');
      setUsername('');
      setPassword('');
      setOsCategory('');
      setCatalogTemplate('');
      if (!attachNow) {
        router.push('/super-admin-console/create-vm/azure/vms');
      }
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to register Azure VM.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div>
        <div className="mb-2 flex items-center gap-2 text-[#B91C1C]">
          <Cloud className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">Super admin only</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Create / Attach VM from Azure</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Create a new private-IP Azure VM (project resource group) or register an existing VM,
          then attach it to a platform admin or tenant for My VM Dashboard.
        </p>
      </div>

      {provisionReady && !provisionReady.ready ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Azure auto-create is not ready: {provisionReady.message || 'Configure cloud_automation_reseller AZURE_* env.'}
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setPageTab('create')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            pageTab === 'create'
              ? 'border-[#B91C1C] text-[#B91C1C]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Create new VM
        </button>
        <button
          type="button"
          onClick={() => setPageTab('register')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            pageTab === 'register'
              ? 'border-[#B91C1C] text-[#B91C1C]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Register existing VM
        </button>
      </div>

      {pageTab === 'create' ? (
        <>
        <form
          onSubmit={handleCreateVm}
          className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Create Azure VM</h2>
            <p className="mt-1 text-sm text-gray-600">
              VM NIC joins the shared VNet below (one subscription, one VNet). Compute resources go in
              the project resource group ({projectVmResourceGroup ?? 'select a project'}).
            </p>
          </div>

          <CreateVmStepper step={createStep} />

          {createStep === 1 ? (
            <div className="space-y-4">
              <div>
                <p className={sectionTitleClass}>Customer & project</p>
                <p className="mt-1 text-xs text-gray-500">
                  Choose who this VM belongs to and which project resource group to use.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Attach to</label>
                  <select
                    className={inputClass}
                    value={createOwnerMode}
                    onChange={(e) => {
                      setCreateOwnerMode(e.target.value as OwnerMode);
                      setCreateOwnerId('');
                    }}
                  >
                    <option value="admin">Platform admin</option>
                    <option value="tenant">Tenant</option>
                  </select>
                </div>
                <OwnerPicker
                  label={createOwnerMode === 'admin' ? 'Platform admin' : 'Tenant'}
                  options={createOwnerOptions}
                  value={createOwnerId}
                  onChange={(id) => {
                    setCreateOwnerId(id);
                  }}
                />
                <div className="sm:col-span-2">
                  <label className={labelClass}>Project *</label>
                  <select
                    className={inputClass}
                    value={createProjectId}
                    onChange={(e) => {
                      setCreateProjectId(e.target.value);
                    }}
                    disabled={projectsLoading || !createOwnerId}
                  >
                    <option value="">
                      {projectsLoading
                        ? 'Loading projects…'
                        : createOwnerId && createProjects.length === 0
                          ? 'No projects for this customer'
                          : 'Select project…'}
                    </option>
                    {createProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.autoGeneratedName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Plan label (optional)</label>
                  <input
                    className={inputClass}
                    value={createPlanLabel}
                    onChange={(e) => {
                      setCreatePlanLabel(e.target.value);
                    }}
                    placeholder="e.g. Lab VM — 2 vCPU"
                  />
                </div>
              </div>

              {selectedProject ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
                  <p>
                    <span className="font-medium">Project:</span> {selectedProject.name}
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void goToCreateStep(2)}
                  disabled={!canProceedCreateStep1()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {createStep === 2 ? (
            <div className="space-y-4">
              <div>
                <p className={sectionTitleClass}>VM spec</p>
                <p className="mt-1 text-xs text-gray-500">
                  Set vCPU, RAM, and disk. Pricing and region are resolved on the final step after
                  you choose an image.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>vCPU *</label>
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    required
                    value={createVcpu}
                    onChange={(e) => {
                      setCreateVcpu(e.target.value);
                    }}
                    placeholder="e.g. 2"
                  />
                </div>
                <div>
                  <label className={labelClass}>RAM (GB) *</label>
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    required
                    value={createRamGb}
                    onChange={(e) => {
                      setCreateRamGb(e.target.value);
                    }}
                    placeholder="e.g. 4"
                  />
                </div>
                <div>
                  <label className={labelClass}>Disk (GB) *</label>
                  <input
                    className={inputClass}
                    type="number"
                    min={8}
                    required
                    value={createSsdGb}
                    onChange={(e) => {
                      setCreateSsdGb(e.target.value);
                    }}
                    placeholder="e.g. 50"
                  />
                </div>
              </div>

              <div>
                <p className={sectionTitleClass}>Options</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={needsGpu}
                      onChange={(e) => {
                        setNeedsGpu(e.target.checked);
                      }}
                    />
                    GPU workload
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={nestedVirtualization}
                      onChange={(e) => {
                        setNestedVirtualization(e.target.checked);
                      }}
                    />
                    Nested virtualization
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCreateStep(1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => void goToCreateStep(3)}
                  disabled={!canProceedCreateStep2()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {createStep === 3 ? (
            <div className="space-y-4">
              <div>
                <p className={sectionTitleClass}>Image & OS</p>
                <p className="mt-1 text-xs text-gray-500">
                  Browse marketplace images or pick a custom template from your subscription.
                </p>
              </div>
              <AzureVmImageSelectPanel
                  osType={createOsType}
                  onOsTypeChange={(nextOs) => {
                    setCreateOsType(nextOs);
                    setImageValidation(null);
                    clearPlacement();
                  }}
                  imageSourceMode={imageSourceMode}
                  onImageSourceModeChange={(mode) => {
                    setImageSourceMode(mode);
                    setImageValidation(null);
                    clearPlacement();
                    if (mode === 'marketplace') {
                      setSelectedCustomTemplate(null);
                    } else {
                      setSelectedMarketplaceImage(null);
                    }
                  }}
                  region={imageBrowseRegion || undefined}
                  regionLabel={imageBrowseRegion ? imageBrowseRegionLabel : undefined}
                  catalogBrowseOnly
                  selectedMarketplaceImage={selectedMarketplaceImage}
                  onMarketplaceSelect={(image) => {
                    setSelectedMarketplaceImage(image);
                    if (image) {
                      const blob = [image.publisher, image.offer, image.label]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                      if (/windows|windowsserver/.test(blob)) {
                        setCreateOsType('windows');
                      }
                    }
                  }}
                  onCustomSelect={(template) => {
                    setSelectedCustomTemplate(template);
                  }}
                  onValidationChange={setImageValidation}
                  customTemplateOptions={customTemplatesInRegion}
                  customTemplateLoading={customTemplateLoading}
                  customTemplateLoadError={customTemplateLoadError}
                  onSearchCustomTemplates={searchCustomTemplates}
                  validationMessage={imageValidation?.message}
                  validationOk={imageValidation?.ok}
                  inputClass={inputClass}
                  labelClass={labelClass}
                />

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCreateStep(2)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => void goToCreateStep(4)}
                  disabled={!canProceedCreateStep3()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {createStep === 4 ? (
            <div className="space-y-4">
              <div>
                <p className={sectionTitleClass}>Review & deploy</p>
                <p className="mt-1 text-xs text-gray-500">
                  {imageSourceMode === 'custom'
                    ? 'Region follows your custom image. Choose a VM size priced for that region.'
                    : assignPublicIp
                      ? 'Public IP: we price matching Azure series across subscription regions and auto-select the cheapest total (compute + disk + IP).'
                      : `Private IP: VM deploys in your home network region (${homeLocationLabel}). Matching Azure series are listed; cheapest is recommended.`}
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={assignPublicIp}
                    disabled={loadingPlacementOptions || imageSourceMode === 'custom'}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAssignPublicIp(next);
                      setSelectedPlacementKey('');
                      setPlacementOptions([]);
                      setPlacementMeta(null);
                      setPlacementSeriesFilter('all');
                      setSpecValidation(null);
                      setPlacementOptionsError(null);
                      setQuoteCheck(null);
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Assign public IP</span>
                    <span className="block text-sm text-gray-600">
                      {imageSourceMode === 'custom'
                        ? 'Custom images use the image region; public IP pricing is included when available.'
                        : 'When enabled, region is auto-selected as the lowest-cost option across your Azure subscription.'}
                    </span>
                  </span>
                </label>
              </div>

              {loadingPlacementOptions ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading priced placement options
                  {assignPublicIp ? ' across subscription regions' : ` for ${homeLocationLabel}`}
                  … (first load can take 1–2 minutes)
                </p>
              ) : null}

              {!loadingPlacementOptions && placementOptionsError ? (
                <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {placementOptionsError}
                </p>
              ) : null}

              {!loadingPlacementOptions && specValidation?.message && !placementOptionsError ? (
                <p
                  className={`text-sm ${specValidation.ok ? 'text-green-700' : 'text-amber-700'}`}
                >
                  {specValidation.message}
                </p>
              ) : null}

              {!loadingPlacementOptions && placementOptions.length > 0 ? (
                <div ref={placementListRef} className="space-y-3">
                  {placementSeriesList.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Series
                      </span>
                      <button
                        type="button"
                        onClick={() => setPlacementSeriesFilter('all')}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                          placementSeriesFilter === 'all'
                            ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        All ({placementOptions.length})
                      </button>
                      {placementSeriesList.map((series) => {
                        const count = placementOptions.filter(
                          (opt) => String(opt.series || '').trim() === series
                        ).length;
                        const isCheapestSeries =
                          placementMeta?.recommended?.series === series;
                        return (
                          <button
                            key={series}
                            type="button"
                            onClick={() => setPlacementSeriesFilter(series)}
                            className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                              placementSeriesFilter === series
                                ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            {series}
                            <span className="ml-1 text-gray-400">({count})</span>
                            {isCheapestSeries ? (
                              <span className="ml-1 text-green-700">· cheapest</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Select
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Region
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Series
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          VM size
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Spec
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Compute
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Disk
                        </th>
                        {assignPublicIp ? (
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                            IP
                          </th>
                        ) : null}
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Total / hr
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {filteredPlacementOptions.map((opt) => {
                        const key = placementRowKey(opt);
                        const selected = selectedPlacementKey === key;
                        const recommendedKey = placementMeta?.recommended
                          ? placementRowKey(placementMeta.recommended)
                          : '';
                        const isRecommended = recommendedKey === key;
                        const regionLabel =
                          azureLocations.find((loc) => loc.name === opt.region)?.displayName ??
                          opt.region;
                        return (
                          <tr
                            key={key}
                            className={`cursor-pointer transition ${
                              selected ? 'bg-red-50' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setSelectedPlacementKey(key);
                              setQuoteCheck(null);
                              setSpecValidation({
                                ok: true,
                                message: `${opt.vmSize}${opt.series ? ` (${opt.series})` : ''} in ${regionLabel} — $${opt.estimatedHourlyUsd.toFixed(4)}/hr`,
                              });
                            }}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="radio"
                                name="placement-option"
                                checked={selected}
                                onChange={() => {
                                  setSelectedPlacementKey(key);
                                  setQuoteCheck(null);
                                }}
                                className="text-[#B91C1C] focus:ring-[#B91C1C]"
                              />
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-900">
                              {regionLabel}
                              {isRecommended ? (
                                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                                  Recommended
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">{opt.series || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-800">
                              {opt.vmSize}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">
                              {formatPlacementSpec(opt)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700">
                              {typeof opt.estimatedComputeHourlyUsd === 'number'
                                ? `$${opt.estimatedComputeHourlyUsd.toFixed(4)}`
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700">
                              {typeof opt.estimatedStorageHourlyUsd === 'number'
                                ? `$${opt.estimatedStorageHourlyUsd.toFixed(4)}`
                                : '—'}
                            </td>
                            {assignPublicIp ? (
                              <td className="px-3 py-2.5 text-right text-gray-700">
                                {typeof opt.estimatedIpHourlyUsd === 'number'
                                  ? `$${opt.estimatedIpHourlyUsd.toFixed(4)}`
                                  : '—'}
                              </td>
                            ) : null}
                            <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                              ${opt.estimatedHourlyUsd.toFixed(4)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  {filteredPlacementOptions.length === 0 ? (
                    <p className="text-sm text-amber-700">
                      No options in this series. Choose All or another series.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!loadingPlacementOptions &&
              placementOptions.length === 0 &&
              !placementOptionsError ? (
                <p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {placementMeta?.message ||
                    'No VM sizes with confirmed availability and pricing for this spec. Try different vCPU/RAM or another image.'}
                </p>
              ) : null}

              {selectedPlacementOption ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-800">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Deployment summary
                    </p>
                    <p>
                      <span className="font-medium">Region:</span>{' '}
                      {createRegionLabel || selectedPlacementOption.region}
                      {placementMeta?.regionMode === 'auto' ? ' (auto — cheapest)' : ''}
                    </p>
                    <p>
                      <span className="font-medium">SKU:</span> {selectedPlacementOption.vmSize}
                      {selectedPlacementOption.series
                        ? ` (${selectedPlacementOption.series})`
                        : ''}
                    </p>
                    <p>
                      <span className="font-medium">Resource group:</span>{' '}
                      {projectVmResourceGroup ?? '—'}
                    </p>
                    <p>
                      <span className="font-medium">Spec:</span>{' '}
                      {selectedPlacementOption
                        ? formatPlacementSpec(selectedPlacementOption)
                        : canonicalSpec || '—'}
                      {canonicalSpec ? (
                        <span className="text-gray-500"> ({canonicalSpec})</span>
                      ) : null}
                    </p>
                    <p>
                      <span className="font-medium">Image:</span>{' '}
                      {imageSourceMode === 'custom'
                        ? selectedCustomTemplate?.label || 'Custom template'
                        : selectedMarketplaceImage?.label || '—'}
                    </p>
                    <p>
                      <span className="font-medium">
                        Est. hourly (USD{assignPublicIp ? ', incl. public IP' : ', private IP only'}
                        ):
                      </span>{' '}
                      ${selectedPlacementOption.estimatedHourlyUsd.toFixed(4)}
                    </p>
                    <p>
                      <span className="font-medium">Public IP:</span> {assignPublicIp ? 'Yes' : 'No'}
                    </p>
                    <p>
                      <span className="font-medium">Nested virtualization:</span>{' '}
                      {nestedVirtualization ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={createAttachNow}
                    onChange={(e) => setCreateAttachNow(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Attach immediately</span>
                    <span className="block text-sm text-gray-600">
                      Assign to the selected customer as soon as provisioning completes.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateStep(3)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCheckQuote()}
                    disabled={
                      checkingQuote ||
                      creating ||
                      !provisionReady?.ready ||
                      !canProceedCreateStep4()
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    {checkingQuote ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking quote…
                      </>
                    ) : (
                      'Check quote'
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      creating ||
                      checkingQuote ||
                      !provisionReady?.ready ||
                      !canProceedCreateStep4() ||
                      !quoteCheck?.valid
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating VM…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Create Azure VM
                      </>
                    )}
                  </button>
                </div>
              </div>
              {quoteCheck?.valid ? (
                <p className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-center text-sm text-green-800">
                  Quote verified — you can create the VM.
                </p>
              ) : selectedPlacementOption ? (
                <p className="text-center text-xs text-gray-500">
                  Run Check quote to verify pricing and Azure quota before Create Azure VM.
                </p>
              ) : null}
              {creating ? (
                <p className="text-center text-xs text-gray-500">
                  Provisioning can take 5–15 minutes. Keep this tab open.
                </p>
              ) : null}
            </div>
          ) : null}
        </form>

        {quoteModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                if (!checkingQuote) setQuoteModalOpen(false);
              }}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="azure-quote-check-title"
              className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      checkingQuote
                        ? 'bg-gray-100'
                        : quoteCheck?.valid
                          ? 'bg-green-50'
                          : 'bg-red-50'
                    }`}
                  >
                    {checkingQuote ? (
                      <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                    ) : quoteCheck?.valid ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div>
                    <h3 id="azure-quote-check-title" className="text-lg font-semibold text-gray-900">
                      {checkingQuote
                        ? 'Checking quote…'
                        : quoteCheck?.valid
                          ? 'Quote available'
                          : 'Quota / quote not available'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {selectedVmSize && createRegionLabel
                        ? `${selectedVmSize} · ${createRegionLabel}`
                        : 'Azure provision quote'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={checkingQuote}
                  onClick={() => setQuoteModalOpen(false)}
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  checkingQuote
                    ? 'border-gray-100 bg-gray-50 text-gray-600'
                    : quoteCheck?.valid
                      ? 'border-green-100 bg-green-50 text-green-800'
                      : 'border-red-100 bg-red-50 text-red-700'
                }`}
              >
                {checkingQuote
                  ? 'Validating SKU, image, pricing, and Azure family quota for this region…'
                  : quoteCheck?.message ||
                    (quoteCheck?.valid
                      ? 'Quote and quota look good.'
                      : 'Quote check failed.')}
              </div>

              {!checkingQuote && quoteCheck && !quoteCheck.valid ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setQuoteModalOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleUseAnotherVmSize}
                    className="inline-flex items-center justify-center rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B]"
                  >
                    Use another VM size/family
                  </button>
                </div>
              ) : null}

              {!checkingQuote && quoteCheck?.valid ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setQuoteModalOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B]"
                  >
                    Continue
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        </>
      ) : null}

      {pageTab === 'register' ? (
      <form
        onSubmit={handleRegister}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-gray-900">Register Azure VM</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Resource group</label>
            <input
              className={inputClass}
              value={resourceGroup}
              onChange={(e) => setResourceGroup(e.target.value)}
              required
              placeholder="e.g. prod-rg"
            />
          </div>
          <div>
            <label className={labelClass}>VM name</label>
            <input
              className={inputClass}
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              required
              placeholder="e.g. app-server-01"
            />
          </div>
          <div>
            <label className={labelClass}>Azure region</label>
            <input
              className={inputClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              required
              placeholder="e.g. centralindia"
            />
          </div>
          <div>
            <label className={labelClass}>Subscription ID (optional)</label>
            <input
              className={inputClass}
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
              placeholder="Azure subscription GUID"
            />
          </div>
          <div>
            <label className={labelClass}>IP address (private or public)</label>
            <input
              className={inputClass}
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              required
              placeholder="e.g. 10.0.1.4 (private via VPN)"
            />
          </div>
          <div>
            <label className={labelClass}>Hostname (optional)</label>
            <input
              className={inputClass}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="Defaults to VM name"
            />
          </div>
          <div>
            <label className={labelClass}>OS category</label>
            <input
              className={inputClass}
              value={osCategory}
              onChange={(e) => setOsCategory(e.target.value)}
              required
              placeholder="e.g. Ubuntu, Windows Server, Rocky Linux"
            />
          </div>
          <div>
            <label className={labelClass}>Catalog template</label>
            <input
              className={inputClass}
              value={catalogTemplate}
              onChange={(e) => setCatalogTemplate(e.target.value)}
              required
              placeholder="e.g. 2 vCPU / 8 GB RAM / 50 GB SSD"
            />
          </div>
          <div>
            <label className={labelClass}>Protocol</label>
            <select
              className={inputClass}
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as 'rdp' | 'ssh')}
            >
              <option value="ssh">SSH</option>
              <option value="rdp">RDP</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Password</label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={attachNow}
              onChange={(e) => setAttachNow(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Attach immediately</span>
              <span className="block text-sm text-gray-600">
                When unchecked, the VM is saved as ready to attach and can be assigned later below.
              </span>
            </span>
          </label>

          {attachNow ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Attach to</label>
                <select
                  className={inputClass}
                  value={ownerMode}
                  onChange={(e) => {
                    setOwnerMode(e.target.value as OwnerMode);
                    setOwnerId('');
                  }}
                >
                  <option value="admin">Platform admin</option>
                  <option value="tenant">Tenant</option>
                </select>
              </div>
              <OwnerPicker
                label={ownerMode === 'admin' ? 'Platform admin' : 'Tenant'}
                options={ownerOptions}
                value={ownerId}
                onChange={setOwnerId}
              />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {attachNow ? 'Register & attach' : 'Register for later attach'}
          </button>
        </div>
      </form>
      ) : null}
    </div>
  );
}
