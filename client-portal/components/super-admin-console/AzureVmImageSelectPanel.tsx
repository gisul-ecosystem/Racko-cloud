'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  ImageIcon,
  Loader2,
  MapPin,
  Search,
  Store,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchAzureImageSkuPlans,
  searchAzureMarketplaceImages,
  validateAzureCustomImage,
  validateAzureVmImage,
  type AzureCustomImageOption,
  type AzureMarketplaceImageCard,
  type AzureMarketplaceImagePlan,
  type AzureVmImageOption,
} from '@/lib/vmCatalogApi';
import { AzureAsyncCombobox, type AzureAsyncOption } from '@/components/super-admin-console/AzureAsyncCombobox';

const PAGE_SIZE = 24;

type ImageTab = 'marketplace' | 'custom';

interface AzureVmImageSelectPanelProps {
  osType?: 'linux' | 'windows';
  onOsTypeChange?: (osType: 'linux' | 'windows') => void;
  imageSourceMode: ImageTab;
  onImageSourceModeChange: (mode: ImageTab) => void;
  region?: string;
  regionLabel?: string;
  catalogBrowseOnly?: boolean;
  selectedMarketplaceImage?: AzureVmImageOption | null;
  onMarketplaceSelect: (image: AzureVmImageOption | null) => void;
  onCustomSelect: (template: AzureCustomImageOption | null) => void;
  onValidationChange: (result: { ok?: boolean; message?: string } | null) => void;
  customTemplateOptions: AzureCustomImageOption[];
  customTemplateLoading: boolean;
  customTemplateLoadError: string | null;
  onSearchCustomTemplates: (query: string) => void;
  validationMessage?: string;
  validationOk?: boolean;
  inputClass: string;
  labelClass: string;
}

function inferOsTypeFromCard(card: AzureMarketplaceImageCard): 'linux' | 'windows' {
  const osList = (card.operatingSystems || []).join(' ').toLowerCase();
  if (/windows/.test(osList)) return 'windows';
  if (/linux/.test(osList)) return 'linux';
  const blob = [card.publisher, card.publisherId, card.displayName, card.offer, card.summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/windows|microsoftsqlserver|microsoftwindows/.test(blob)) return 'windows';
  return 'linux';
}

function cardToVmImage(card: AzureMarketplaceImageCard, plan: AzureMarketplaceImagePlan): AzureVmImageOption {
  const publisher = plan.publisher || card.publisherId || card.publisher || '';
  const offer = plan.offer || card.offer || '';
  const sku = plan.sku || card.sku || plan.planId || '';
  const baseName = plan.displayName || card.displayName || `${publisher}/${offer}/${sku}`;
  const label = plan.versionLabel ? `${baseName} — ${plan.versionLabel}` : baseName;
  return { publisher, offer, sku, label };
}

function planRowLabel(plan: AzureMarketplaceImagePlan): string {
  return plan.displayName || plan.sku || plan.planId || 'Unknown plan';
}

function AzureMarketplaceProductCard({
  card,
  selected,
  selectedPlanLabel,
  dropdownOpen,
  plans,
  plansLoading,
  plansError,
  validating,
  onToggleSelect,
  onPickPlan,
  onCloseDropdown,
}: {
  card: AzureMarketplaceImageCard;
  selected: boolean;
  selectedPlanLabel?: string | null;
  dropdownOpen: boolean;
  plans: AzureMarketplaceImagePlan[];
  plansLoading: boolean;
  plansError: string | null;
  validating: boolean;
  onToggleSelect: () => void;
  onPickPlan: (plan: AzureMarketplaceImagePlan) => void;
  onCloseDropdown: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const pad = 8;
    const menuWidth = Math.min(Math.max(rect.width, 260), Math.min(400, window.innerWidth - pad * 2));
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pad - menuWidth);
    }
    if (left < pad) left = pad;

    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(260, preferBelow ? spaceBelow : spaceAbove);

    if (preferBelow) {
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left,
        width: menuWidth,
        maxHeight: Math.max(120, maxHeight),
        zIndex: 80,
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 4,
        left,
        width: menuWidth,
        maxHeight: Math.max(120, maxHeight),
        zIndex: 80,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!dropdownOpen) return;
    updateMenuPosition();
  }, [dropdownOpen, plansLoading, plans.length, updateMenuPosition]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onCloseDropdown();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseDropdown();
    }
    function onReposition() {
      updateMenuPosition();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [dropdownOpen, onCloseDropdown, updateMenuPosition]);

  const menu =
    dropdownOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl"
            role="listbox"
          >
            {plansLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading versions…
              </div>
            ) : plans.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">
                {plansError || 'No versions available for this image.'}
              </p>
            ) : (
              <>
                {plansError ? (
                  <p className="shrink-0 border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {plansError}
                  </p>
                ) : null}
                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                  {plans.map((plan) => {
                    const label = planRowLabel(plan);
                    const isActive =
                      selected &&
                      selectedPlanLabel != null &&
                      (selectedPlanLabel === label ||
                        selectedPlanLabel.startsWith(`${label} —`) ||
                        selectedPlanLabel.includes(plan.sku || ''));
                    return (
                      <li key={plan.planId || plan.sku || label}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-gray-50 ${
                            isActive ? 'bg-[#B91C1C]/5 font-medium text-[#B91C1C]' : 'text-gray-900'
                          }`}
                          onClick={() => onPickPlan(plan)}
                        >
                          <span className="break-words leading-snug">{label}</span>
                          {plan.versionLabel ? (
                            <span className="break-words text-xs text-gray-500">{plan.versionLabel}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`flex min-h-[210px] min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-3.5 transition ${
        selected
          ? 'border-[#B91C1C] ring-2 ring-[#B91C1C]/20'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="mb-2.5 flex min-w-0 items-start gap-2.5">
        {card.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded object-contain" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
            <Cloud className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-gray-900">
            {card.displayName}
          </p>
          <p className="truncate text-xs text-gray-500">{card.publisher || card.publisherId}</p>
          <p className="mt-0.5 text-xs text-gray-400">Virtual Machine</p>
        </div>
      </div>

      {card.summary ? (
        <p className="mb-2.5 line-clamp-3 min-h-0 flex-1 break-words text-xs leading-relaxed text-gray-600">
          {card.summary}
        </p>
      ) : (
        <div className="mb-2.5 flex-1" />
      )}

      {selected && selectedPlanLabel ? (
        <p className="mb-2 line-clamp-2 break-words rounded border border-green-100 bg-green-50 px-2 py-1.5 text-xs text-green-800">
          {selectedPlanLabel}
        </p>
      ) : null}

      <div className="mt-auto w-full min-w-0">
        <button
          ref={buttonRef}
          type="button"
          disabled={validating}
          onClick={onToggleSelect}
          className={`inline-flex w-full max-w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
            selected
              ? 'border-[#B91C1C] bg-[#B91C1C] text-white hover:bg-[#991B1B]'
              : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
          }`}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          <span className="inline-flex min-w-0 items-center gap-2 truncate">
            {validating ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
            <span className="truncate">{selected ? 'Change version' : 'Select'}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {menu}
    </div>
  );
}

export function AzureVmImageSelectPanel({
  onOsTypeChange,
  imageSourceMode,
  onImageSourceModeChange,
  region,
  regionLabel,
  catalogBrowseOnly = false,
  selectedMarketplaceImage = null,
  onMarketplaceSelect,
  onCustomSelect,
  onValidationChange,
  customTemplateOptions,
  customTemplateLoading,
  customTemplateLoadError,
  onSearchCustomTemplates,
  validationMessage,
  validationOk,
  inputClass,
  labelClass,
}: AzureVmImageSelectPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [cards, setCards] = useState<AzureMarketplaceImageCard[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseSource, setBrowseSource] = useState<string | null>(null);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [dropdownPlans, setDropdownPlans] = useState<AzureMarketplaceImagePlan[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [dropdownError, setDropdownError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const [customTemplateQuery, setCustomTemplateQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadMarketplace = useCallback(async () => {
    if (imageSourceMode !== 'marketplace') return;
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const result = await searchAzureMarketplaceImages({
        query: debouncedQuery,
        osType: 'all',
        skip,
        take: PAGE_SIZE,
      });
      setCards(result.rows);
      setTotal(result.total);
      setBrowseSource(result.source ?? null);
      if (result.rows.length === 0) {
        setBrowseError(
          debouncedQuery
            ? `No marketplace images match "${debouncedQuery}".`
            : 'No marketplace images found.'
        );
      }
    } catch (err) {
      setCards([]);
      setTotal(0);
      setBrowseError(
        err instanceof ApiError ? err.message : 'Could not browse Azure marketplace images.'
      );
    } finally {
      setBrowseLoading(false);
    }
  }, [debouncedQuery, imageSourceMode, skip]);

  useEffect(() => {
    if (imageSourceMode !== 'marketplace') return;
    setSkip(0);
    setSelectedCardId(null);
    setOpenCardId(null);
    onMarketplaceSelect(null);
    onValidationChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, imageSourceMode]);

  useEffect(() => {
    if (!selectedMarketplaceImage || cards.length === 0) return;
    const match = cards.find(
      (card) =>
        (card.publisherId === selectedMarketplaceImage.publisher ||
          card.publisher === selectedMarketplaceImage.publisher) &&
        card.offer === selectedMarketplaceImage.offer
    );
    if (match) setSelectedCardId(match.id);
  }, [cards, selectedMarketplaceImage]);

  useEffect(() => {
    void loadMarketplace();
  }, [loadMarketplace]);

  const loadPlansForCard = useCallback(
    async (card: AzureMarketplaceImageCard) => {
      const publisher = card.publisherId || card.publisher || '';
      const offer = card.offer || '';
      const embedded = card.plans.filter((p) => p.sku || p.planId);

      if (!publisher || !offer || !region?.trim()) {
        setDropdownPlans(embedded);
        setDropdownLoading(false);
        setDropdownError(null);
        return;
      }

      setDropdownLoading(true);
      setDropdownError(null);
      try {
        const rows = await fetchAzureImageSkuPlans({
          region,
          publisher,
          offer,
          productDisplayName: card.displayName,
        });
        setDropdownPlans(rows.length > 0 ? rows : embedded);
      } catch (err) {
        setDropdownPlans(embedded);
        setDropdownError(
          err instanceof ApiError ? err.message : 'Could not load versions from Azure.'
        );
      } finally {
        setDropdownLoading(false);
      }
    },
    [region]
  );

  const closeDropdown = useCallback(() => {
    setOpenCardId(null);
    setDropdownPlans([]);
    setDropdownError(null);
    setDropdownLoading(false);
  }, []);

  const validateMarketplacePlan = useCallback(
    async (card: AzureMarketplaceImageCard, plan: AzureMarketplaceImagePlan) => {
      const image = cardToVmImage(card, plan);
      if (!image.publisher || !image.offer || !image.sku) {
        onValidationChange({ ok: false, message: 'Image is missing publisher/offer/SKU.' });
        return;
      }
      setValidating(true);
      setSelectedCardId(card.id);
      onOsTypeChange?.(inferOsTypeFromCard(card));
      onValidationChange(null);
      try {
        const result = await validateAzureVmImage({
          publisher: image.publisher,
          offer: image.offer,
          sku: image.sku,
        });
        onMarketplaceSelect(image);
        onValidationChange({
          ok: result.valid,
          message: result.valid
            ? result.availableRegions?.length
              ? `${result.label || image.label} · available in ${result.availableRegions.length} priced region${result.availableRegions.length === 1 ? '' : 's'}`
              : result.label || image.label
            : result.message || 'Invalid marketplace image.',
        });
        if (result.valid) closeDropdown();
      } catch (err) {
        onMarketplaceSelect(null);
        onValidationChange({
          ok: false,
          message:
            err instanceof ApiError ? err.message : 'Could not validate marketplace image.',
        });
      } finally {
        setValidating(false);
      }
    },
    [closeDropdown, onMarketplaceSelect, onOsTypeChange, onValidationChange]
  );

  const handleToggleSelect = useCallback(
    (card: AzureMarketplaceImageCard) => {
      if (openCardId === card.id) {
        closeDropdown();
        return;
      }
      setOpenCardId(card.id);
      setDropdownPlans([]);
      void loadPlansForCard(card);
    },
    [closeDropdown, loadPlansForCard, openCardId]
  );

  const customComboboxOptions = useMemo<AzureAsyncOption[]>(
    () =>
      customTemplateOptions.map((row) => ({
        id: row.id,
        label: row.label,
        sublabel: `${row.source} · ${row.osType}${row.location ? ` · ${row.location}` : ''}`,
        value: row.label,
      })),
    [customTemplateOptions]
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + PAGE_SIZE, total);

  return (
    <div className="overflow-x-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex min-w-0 items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
        <MapPin className="h-4 w-4 shrink-0 text-gray-500" />
        <span className="min-w-0 break-words">
          {catalogBrowseOnly ? (
            <>
              Catalog browse: <strong>Azure subscription marketplace</strong>
              <span className="text-gray-500"> · deploy region picked on Review</span>
            </>
          ) : region ? (
            <>
              Region: <strong>{regionLabel || region}</strong>
            </>
          ) : null}
        </span>
      </div>

      <div className="flex min-h-[420px] min-w-0">
        <nav className="hidden w-40 shrink-0 border-r border-gray-100 bg-gray-50 p-3 sm:block">
          <button
            type="button"
            onClick={() => {
              onImageSourceModeChange('marketplace');
              onCustomSelect(null);
              onValidationChange(null);
              closeDropdown();
            }}
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              imageSourceMode === 'marketplace'
                ? 'bg-white font-medium text-[#B91C1C] shadow-sm'
                : 'text-gray-700 hover:bg-white/70'
            }`}
          >
            <Store className="h-4 w-4 shrink-0" />
            Marketplace
          </button>
          <button
            type="button"
            onClick={() => {
              onImageSourceModeChange('custom');
              onMarketplaceSelect(null);
              setSelectedCardId(null);
              onValidationChange(null);
              closeDropdown();
              void onSearchCustomTemplates('');
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              imageSourceMode === 'custom'
                ? 'bg-white font-medium text-[#B91C1C] shadow-sm'
                : 'text-gray-700 hover:bg-white/70'
            }`}
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            My images
          </button>
        </nav>

        <div className="min-w-0 flex-1 overflow-x-hidden p-4">
          <div className="mb-3 flex gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => {
                onImageSourceModeChange('marketplace');
                onCustomSelect(null);
                onValidationChange(null);
                closeDropdown();
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                imageSourceMode === 'marketplace'
                  ? 'border-[#B91C1C] bg-[#B91C1C]/5 font-medium text-[#B91C1C]'
                  : 'border-gray-200 text-gray-700'
              }`}
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={() => {
                onImageSourceModeChange('custom');
                onMarketplaceSelect(null);
                setSelectedCardId(null);
                onValidationChange(null);
                closeDropdown();
                void onSearchCustomTemplates('');
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                imageSourceMode === 'custom'
                  ? 'border-[#B91C1C] bg-[#B91C1C]/5 font-medium text-[#B91C1C]'
                  : 'border-gray-200 text-gray-700'
              }`}
            >
              My images
            </button>
          </div>

          {imageSourceMode === 'marketplace' ? (
            <div className="mb-4 space-y-2">
              <div>
                <label className={labelClass}>Search the Marketplace</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    className={`${inputClass} pl-9`}
                    placeholder="Windows Server, Ubuntu, RHEL, Debian…"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSkip(0);
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Use <strong>Select</strong> on a card to choose the exact version.
              </p>
            </div>
          ) : (
            <p className="mb-4 text-xs text-gray-500">
              Custom images are listed from your subscription. Region is taken from the template.
            </p>
          )}

          {imageSourceMode === 'marketplace' && selectedMarketplaceImage && validationOk ? (
            <div className="mb-4 overflow-hidden rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Check className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-sm font-semibold text-green-900">Selected version</p>
                  <p className="mt-0.5 break-words text-sm text-green-800">
                    {selectedMarketplaceImage.label}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-green-700">
                    {selectedMarketplaceImage.publisher}/{selectedMarketplaceImage.offer}/
                    {selectedMarketplaceImage.sku}
                  </p>
                  {validationMessage ? (
                    <p className="mt-1 break-words text-xs text-green-700">{validationMessage}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-green-300 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
                  onClick={() => {
                    setSelectedCardId(null);
                    onMarketplaceSelect(null);
                    onValidationChange(null);
                    closeDropdown();
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {imageSourceMode === 'marketplace' ? (
            browseLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading marketplace images…
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="min-w-0 break-words">
                    Showing {showingFrom} to {showingTo} of {total} results
                    {browseSource ? ` · via ${browseSource}` : ''}
                  </span>
                  {total > PAGE_SIZE ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-gray-200 p-1 disabled:opacity-40"
                        disabled={skip <= 0}
                        onClick={() => {
                          closeDropdown();
                          setSkip(Math.max(0, skip - PAGE_SIZE));
                        }}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span>
                        Page {currentPage} of {pageCount}
                      </span>
                      <button
                        type="button"
                        className="rounded border border-gray-200 p-1 disabled:opacity-40"
                        disabled={skip + PAGE_SIZE >= total}
                        onClick={() => {
                          closeDropdown();
                          setSkip(skip + PAGE_SIZE);
                        }}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {browseError && cards.length === 0 ? (
                  <p className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                    {browseError}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {cards.map((card) => (
                      <AzureMarketplaceProductCard
                        key={card.id}
                        card={card}
                        selected={selectedCardId === card.id && Boolean(selectedMarketplaceImage)}
                        selectedPlanLabel={
                          selectedCardId === card.id ? selectedMarketplaceImage?.label : null
                        }
                        dropdownOpen={openCardId === card.id}
                        plans={openCardId === card.id ? dropdownPlans : []}
                        plansLoading={openCardId === card.id && dropdownLoading}
                        plansError={openCardId === card.id ? dropdownError : null}
                        validating={validating && selectedCardId === card.id}
                        onToggleSelect={() => handleToggleSelect(card)}
                        onPickPlan={(plan) => void validateMarketplacePlan(card, plan)}
                        onCloseDropdown={closeDropdown}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          ) : (
            <AzureAsyncCombobox
              label="Custom template"
              value={customTemplateQuery}
              onChange={(value) => {
                setCustomTemplateQuery(value);
                onCustomSelect(null);
                onValidationChange(null);
              }}
              onSelect={(option) => {
                const template = customTemplateOptions.find((row) => row.label === option.value);
                if (!template) return;
                setCustomTemplateQuery(template.label);
                void validateAzureCustomImage({
                  imageId: template.id,
                  region,
                })
                  .then((result) => {
                    onCustomSelect(template);
                    onValidationChange({
                      ok: result.valid,
                      message: result.valid
                        ? result.label || template.label
                        : result.message || 'Invalid custom template.',
                    });
                  })
                  .catch((err: unknown) => {
                    onCustomSelect(null);
                    onValidationChange({
                      ok: false,
                      message:
                        err instanceof ApiError
                          ? err.message
                          : 'Could not validate custom template.',
                    });
                  });
              }}
              placeholder="Search managed images or gallery templates"
              options={customComboboxOptions}
              onSearch={onSearchCustomTemplates}
              loading={customTemplateLoading}
              errorMessage={customTemplateLoadError}
              emptyMessage="No templates in this region — check images in your Azure subscription."
              validationMessage={validationMessage}
              validationOk={validationOk}
              required
              inputClassName={inputClass}
            />
          )}

          {validationMessage &&
          !(imageSourceMode === 'marketplace' && selectedMarketplaceImage && validationOk) ? (
            <p className={`mt-4 break-words text-sm ${validationOk ? 'text-green-700' : 'text-amber-700'}`}>
              {validationMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
