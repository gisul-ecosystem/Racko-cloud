'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
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
  osType: 'linux' | 'windows';
  onOsTypeChange: (osType: 'linux' | 'windows') => void;
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

function cardToVmImage(card: AzureMarketplaceImageCard, plan: AzureMarketplaceImagePlan): AzureVmImageOption {
  const publisher = plan.publisher || card.publisherId || card.publisher || '';
  const offer = plan.offer || card.offer || '';
  const sku = plan.sku || card.sku || plan.planId || '';
  const baseName = plan.displayName || card.displayName || `${publisher}/${offer}/${sku}`;
  const label = plan.versionLabel ? `${baseName} — ${plan.versionLabel}` : baseName;
  return { publisher, offer, sku, label };
}

function AzureImagePlanPickerRow({
  plan,
  onSelect,
}: {
  plan: AzureMarketplaceImagePlan;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full flex-col gap-1 px-5 py-4 text-left hover:bg-gray-50"
        onClick={onSelect}
      >
        <span className="text-base font-medium text-gray-900">
          {plan.displayName || plan.sku || plan.planId}
        </span>
        {plan.versionLabel ? (
          <span className="text-sm text-gray-600">{plan.versionLabel}</span>
        ) : null}
        {plan.summary ? <span className="text-xs text-gray-500">{plan.summary}</span> : null}
        {plan.sku && plan.displayName && plan.sku !== plan.displayName ? (
          <span className="text-xs text-gray-400">SKU: {plan.sku}</span>
        ) : null}
      </button>
    </li>
  );
}

function AzureImageCard({
  card,
  selected,
  validating,
  onSelect,
}: {
  card: AzureMarketplaceImageCard;
  selected: boolean;
  validating: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={validating}
      className={`flex h-full flex-col rounded-lg border p-4 text-left transition hover:border-[#B91C1C]/40 hover:shadow-sm ${
        selected
          ? 'border-[#B91C1C] bg-[#B91C1C]/5 ring-2 ring-[#B91C1C]/20'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        {card.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.iconUrl} alt="" className="h-10 w-10 rounded object-contain" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-gray-500">
            <Cloud className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{card.displayName}</p>
          <p className="truncate text-xs text-gray-500">{card.publisher || card.publisherId}</p>
        </div>
      </div>
      {card.summary ? (
        <p className="mb-3 line-clamp-2 flex-1 text-xs text-gray-600">{card.summary}</p>
      ) : (
        <div className="flex-1" />
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">
          {card.plans.length > 1 ? `${card.plans.length} SKUs` : card.offer || 'VM image'}
        </span>
        {validating && selected ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
        ) : (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              selected ? 'bg-[#B91C1C] text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {selected ? 'Selected' : 'Select'}
          </span>
        )}
      </div>
    </button>
  );
}

export function AzureVmImageSelectPanel({
  osType,
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
  const [planPickerCard, setPlanPickerCard] = useState<AzureMarketplaceImageCard | null>(null);
  const [planPickerPlans, setPlanPickerPlans] = useState<AzureMarketplaceImagePlan[]>([]);
  const [planPickerLoading, setPlanPickerLoading] = useState(false);
  const [planPickerError, setPlanPickerError] = useState<string | null>(null);
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
        osType,
        skip,
        take: PAGE_SIZE,
      });
      setCards(result.rows);
      setTotal(result.total);
      setBrowseSource(result.source ?? null);
      if (result.rows.length === 0) {
        setBrowseError(
          debouncedQuery
            ? `No ${osType === 'windows' ? 'Windows' : 'Linux'} images match "${debouncedQuery}".`
            : `No ${osType === 'windows' ? 'Windows' : 'Linux'} marketplace images found.`
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
  }, [debouncedQuery, imageSourceMode, osType, skip]);

  useEffect(() => {
    if (imageSourceMode !== 'marketplace') return;
    setSkip(0);
    setSelectedCardId(null);
    onMarketplaceSelect(null);
    onValidationChange(null);
    // Reset only when browse filters change — not when parent callback refs change.
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

  useEffect(() => {
    if (!planPickerCard) {
      setPlanPickerPlans([]);
      setPlanPickerLoading(false);
      setPlanPickerError(null);
      return;
    }

    const publisher = planPickerCard.publisherId || planPickerCard.publisher || '';
    const offer = planPickerCard.offer || '';
    if (!publisher || !offer || !region?.trim()) {
      setPlanPickerPlans(planPickerCard.plans);
      return;
    }

    let cancelled = false;
    setPlanPickerLoading(true);
    setPlanPickerError(null);
    void fetchAzureImageSkuPlans({
      region,
      publisher,
      offer,
      productDisplayName: planPickerCard.displayName,
    })
      .then((rows) => {
        if (cancelled) return;
        setPlanPickerPlans(rows.length > 0 ? rows : planPickerCard.plans);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlanPickerPlans(planPickerCard.plans);
        setPlanPickerError(
          err instanceof ApiError ? err.message : 'Could not load SKU details from Azure.'
        );
      })
      .finally(() => {
        if (!cancelled) setPlanPickerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planPickerCard, region]);

  const validateMarketplacePlan = useCallback(
    async (card: AzureMarketplaceImageCard, plan: AzureMarketplaceImagePlan) => {
      const image = cardToVmImage(card, plan);
      if (!image.publisher || !image.offer || !image.sku) {
        onValidationChange({ ok: false, message: 'Image is missing publisher/offer/SKU.' });
        return;
      }
      setValidating(true);
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
      } catch (err) {
        onMarketplaceSelect(null);
        onValidationChange({
          ok: false,
          message:
            err instanceof ApiError ? err.message : 'Could not validate marketplace image.',
        });
      } finally {
        setValidating(false);
        setPlanPickerCard(null);
      }
    },
    [onMarketplaceSelect, onValidationChange]
  );

  const handleCardSelect = useCallback(
    (card: AzureMarketplaceImageCard) => {
      setSelectedCardId(card.id);
      const usablePlans = card.plans.filter((p) => p.sku || (p.publisher && p.offer && p.sku));
      const fallbackPlan =
        usablePlans[0] ||
        (card.publisherId && card.offer && card.sku
          ? {
              publisher: card.publisherId,
              offer: card.offer,
              sku: card.sku,
              displayName: card.displayName,
            }
          : null);

      if (!fallbackPlan) {
        onValidationChange({ ok: false, message: 'No deployable SKU found for this image.' });
        return;
      }

      if (usablePlans.length > 1) {
        setPlanPickerPlans([]);
        setPlanPickerCard(card);
        return;
      }

      void validateMarketplacePlan(card, fallbackPlan);
    },
    [onValidationChange, validateMarketplacePlan]
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

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
        <MapPin className="h-4 w-4 shrink-0 text-gray-500" />
        <span>
          {catalogBrowseOnly ? (
            <>
              Catalog browse: <strong>Azure subscription marketplace</strong>
              <span className="text-gray-500">
                {' '}
                · deploy region picked automatically in the next step
              </span>
            </>
          ) : region ? (
            <>
              Region: <strong>{regionLabel || region}</strong>
            </>
          ) : null}
        </span>
      </div>

      <div className="flex min-h-[380px]">
        <nav className="w-44 shrink-0 border-r border-gray-100 bg-gray-50 p-3">
          <button
            type="button"
            onClick={() => {
              onImageSourceModeChange('marketplace');
              onCustomSelect(null);
              onValidationChange(null);
            }}
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              imageSourceMode === 'marketplace'
                ? 'bg-white font-medium text-[#B91C1C] shadow-sm'
                : 'text-gray-700 hover:bg-white/70'
            }`}
          >
            <Store className="h-4 w-4" />
            Marketplace
          </button>
          <button
            type="button"
            onClick={() => {
              onImageSourceModeChange('custom');
              onMarketplaceSelect(null);
              setSelectedCardId(null);
              onValidationChange(null);
              void onSearchCustomTemplates('');
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              imageSourceMode === 'custom'
                ? 'bg-white font-medium text-[#B91C1C] shadow-sm'
                : 'text-gray-700 hover:bg-white/70'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            My images
          </button>
        </nav>

        <div className="min-w-0 flex-1 p-4">
          {imageSourceMode === 'marketplace' ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>OS type</label>
                <select
                  className={inputClass}
                  value={osType}
                  onChange={(e) => {
                    const nextOs = e.target.value as 'linux' | 'windows';
                    if (nextOs === osType) return;
                    onOsTypeChange(nextOs);
                    setSelectedCardId(null);
                    onMarketplaceSelect(null);
                    onValidationChange(null);
                    setSkip(0);
                  }}
                >
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Search marketplace</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    className={`${inputClass} pl-9`}
                    placeholder="Ubuntu, RHEL, Windows Server…"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSkip(0);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="mb-4 text-xs text-gray-500">
              Custom images are listed from your subscription. Region is taken from the template.
            </p>
          )}

          {imageSourceMode === 'marketplace' && selectedMarketplaceImage && validationOk ? (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <Check className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-green-900">Selected image</p>
                  <p className="mt-0.5 text-sm text-green-800">{selectedMarketplaceImage.label}</p>
                  <p className="mt-1 font-mono text-xs text-green-700">
                    {selectedMarketplaceImage.publisher}/{selectedMarketplaceImage.offer}/
                    {selectedMarketplaceImage.sku}
                  </p>
                  {validationMessage ? (
                    <p className="mt-1 text-xs text-green-700">{validationMessage}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-green-300 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
                  onClick={() => {
                    setSelectedCardId(null);
                    onMarketplaceSelect(null);
                    onValidationChange(null);
                  }}
                >
                  Change
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
                <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {total} result{total === 1 ? '' : 's'}
                    {browseSource ? ` · via ${browseSource}` : ''}
                  </span>
                  {total > PAGE_SIZE ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-gray-200 p-1 disabled:opacity-40"
                        disabled={skip <= 0}
                        onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
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
                        onClick={() => setSkip(skip + PAGE_SIZE)}
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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map((card) => (
                      <AzureImageCard
                        key={card.id}
                        card={card}
                        selected={selectedCardId === card.id}
                        validating={validating && selectedCardId === card.id}
                        onSelect={() => handleCardSelect(card)}
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

          {validationMessage && !(imageSourceMode === 'marketplace' && selectedMarketplaceImage && validationOk) ? (
            <p className={`mt-4 text-sm ${validationOk ? 'text-green-700' : 'text-amber-700'}`}>
              {validationMessage}
            </p>
          ) : null}
        </div>
      </div>

      {planPickerCard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-lg font-semibold text-gray-900">Select a version / SKU</p>
              <p className="mt-1 text-sm text-gray-600">{planPickerCard.displayName}</p>
              <p className="mt-1 text-xs text-gray-500">
                Choose the image version to deploy — names match Azure portal labels.
              </p>
            </div>
            {planPickerLoading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading versions from Azure…
              </div>
            ) : (
              <>
                {planPickerError ? (
                  <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
                    {planPickerError}
                  </p>
                ) : null}
                <ul className="max-h-[min(28rem,60vh)] divide-y divide-gray-100 overflow-y-auto">
                  {(planPickerPlans.length > 0 ? planPickerPlans : planPickerCard.plans).map((plan) => (
                    <AzureImagePlanPickerRow
                      key={plan.planId || plan.sku || plan.displayName}
                      plan={plan}
                      onSelect={() => void validateMarketplacePlan(planPickerCard, plan)}
                    />
                  ))}
                </ul>
              </>
            )}
            <div className="border-t border-gray-100 px-5 py-3 text-right">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setPlanPickerCard(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
