'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchVmManagementPlatformTemplates,
  updateVmManagementAllowedTemplates,
  updateVmManagementTemplatePricing,
} from '@/lib/tenantApi';
import type {
  TemplateItemPricing,
  VmManagementPlatformTemplates,
  VmManagementPricing,
} from '@/lib/tenantTypes';

interface VmManagementConfigPanelProps {
  tenantId: string;
  initialPricing: VmManagementPricing;
  onPricingSaved?: (pricing: VmManagementPricing) => void;
  onTemplatesSaved?: () => void;
  onFlash?: (msg: string) => void;
  onFlashErr?: (msg: string) => void;
}

const EMPTY_PRICING: TemplateItemPricing = {
  cpuRatePerCoreMonthly: 0,
  ramRatePerGbMonthly: 0,
  diskRatePerGbMonthly: 0,
  billingDiscounts: { quarterly: 0, yearly: 0 },
};

export function VmManagementConfigPanel({
  tenantId,
  initialPricing,
  onPricingSaved,
  onTemplatesSaved,
  onFlash,
  onFlashErr,
}: VmManagementConfigPanelProps) {
  const [platformTemplates, setPlatformTemplates] =
    useState<VmManagementPlatformTemplates | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [allEnabled, setAllEnabled] = useState(true);
  const [savingPricing, setSavingPricing] = useState(false);
  const [savingAllowlist, setSavingAllowlist] = useState(false);

  const [templatePricing, setTemplatePricing] = useState<Record<string, TemplateItemPricing>>(
    () => initialPricing.templatePricing ?? {}
  );

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const data = await fetchVmManagementPlatformTemplates(tenantId);
      setPlatformTemplates(data);
      setAllEnabled(data.selectionMode === 'all_enabled');
      setSelectedIds(
        new Set(data.templates.filter((t) => t.selected).map((t) => t.templateId))
      );
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Failed to load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  }, [tenantId, onFlashErr]);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    setTemplatePricing(initialPricing.templatePricing ?? {});
  }, [initialPricing]);

  function toggleTemplate(id: number) {
    if (allEnabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAllEnabledToggle(checked: boolean) {
    setAllEnabled(checked);
    if (checked && platformTemplates) {
      setSelectedIds(new Set(platformTemplates.templates.map((t) => t.templateId)));
    }
  }

  function getPricing(templateId: number): TemplateItemPricing {
    return templatePricing[String(templateId)] ?? { ...EMPTY_PRICING };
  }

  function setPricingField(
    templateId: number,
    field: 'cpuRatePerCoreMonthly' | 'ramRatePerGbMonthly' | 'diskRatePerGbMonthly',
    value: number
  ) {
    setTemplatePricing((prev) => ({
      ...prev,
      [String(templateId)]: { ...getPricing(templateId), [field]: Math.round(value) },
    }));
  }

  function setDiscount(
    templateId: number,
    key: 'quarterly' | 'yearly',
    pct: number
  ) {
    const clamped = Math.min(100, Math.max(0, pct));
    const current = getPricing(templateId);
    setTemplatePricing((prev) => ({
      ...prev,
      [String(templateId)]: {
        ...current,
        billingDiscounts: {
          quarterly: current.billingDiscounts?.quarterly ?? 0,
          yearly: current.billingDiscounts?.yearly ?? 0,
          [key]: clamped / 100,
        },
      },
    }));
  }

  function getActiveTemplateIds(): number[] {
    if (allEnabled && platformTemplates) {
      return platformTemplates.templates.map((t) => t.templateId);
    }
    return [...selectedIds];
  }

  async function handleSavePricing() {
    setSavingPricing(true);
    try {
      const activeIds = getActiveTemplateIds();
      const pricingToSave: Record<string, TemplateItemPricing> = {};
      for (const id of activeIds) {
        pricingToSave[String(id)] = getPricing(id);
      }

      const updatedConfig = await updateVmManagementTemplatePricing(tenantId, pricingToSave);

      const savedPricing: VmManagementPricing = {
        ...(updatedConfig.pricing as unknown as VmManagementPricing),
        templatePricing: pricingToSave,
      };

      setTemplatePricing(pricingToSave);
      onPricingSaved?.(savedPricing);
      onFlash?.('Pricing saved.');
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Failed to save pricing.');
    } finally {
      setSavingPricing(false);
    }
  }

  async function handleSaveAllowlist() {
    setSavingAllowlist(true);
    try {
      const allowedTemplateIds = allEnabled ? [] : [...selectedIds];
      await updateVmManagementAllowedTemplates(tenantId, allowedTemplateIds);
      onTemplatesSaved?.();
      onFlash?.('Template allowlist saved.');
      await loadTemplates();
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Failed to save allowlist.');
    } finally {
      setSavingAllowlist(false);
    }
  }

  return (
    <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Template allowlist &amp; pricing</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Select templates this tenant can order and set per-template pricing rates.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={allEnabled}
            onChange={(e) => handleAllEnabledToggle(e.target.checked)}
            className="rounded border-gray-300"
          />
          All enabled templates
        </label>
      </div>

      {/* Template list */}
      {templatesLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !platformTemplates || platformTemplates.templates.length === 0 ? (
        <p className="text-sm text-gray-500">
          No platform templates are enabled. Enable templates in the VM management catalog first.
        </p>
      ) : (
        <div className="space-y-3">
          {platformTemplates.templates.map((tpl) => {
            const isSelected = allEnabled || selectedIds.has(tpl.templateId);
            const p = getPricing(tpl.templateId);
            const qPct = Math.round((p.billingDiscounts?.quarterly ?? 0) * 100);
            const yPct = Math.round((p.billingDiscounts?.yearly ?? 0) * 100);

            return (
              <div
                key={tpl.templateId}
                className={`rounded-lg border bg-white transition-opacity ${
                  isSelected ? 'border-gray-200' : 'border-gray-100 opacity-50'
                }`}
              >
                {/* Template header row */}
                <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={allEnabled}
                    onChange={() => toggleTemplate(tpl.templateId)}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                    <p className="text-xs text-gray-500">
                      ID {tpl.templateId} · {tpl.node}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {tpl.cpuCores} vCPU · {tpl.memoryGb} GB RAM · {tpl.diskGb} GB disk
                    </p>
                  </div>
                  {!isSelected && (
                    <span className="text-xs text-gray-400 italic self-center">Not enabled</span>
                  )}
                </div>

                {/* Pricing fields — always visible when selected */}
                {isSelected && (
                  <div className="px-4 py-3 bg-gray-50/40">
                    {/* Rate fields */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          ['cpuRatePerCoreMonthly', 'CPU / core (₹)'],
                          ['ramRatePerGbMonthly', 'RAM / GB (₹)'],
                          ['diskRatePerGbMonthly', 'Disk / GB (₹)'],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field}>
                          <label className="mb-1 block text-xs text-gray-500">{label}</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={p[field]}
                            onChange={(e) =>
                              setPricingField(tpl.templateId, field, Number(e.target.value))
                            }
                            className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#B91C1C] focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Discount fields */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Quarterly discount (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={qPct}
                          onChange={(e) =>
                            setDiscount(tpl.templateId, 'quarterly', Number(e.target.value))
                          }
                          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#B91C1C] focus:outline-none"
                        />
                        <p className="mt-0.5 text-xs text-gray-400">
                          Applied to 3-month billing (0–100).
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Yearly discount (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={yPct}
                          onChange={(e) =>
                            setDiscount(tpl.templateId, 'yearly', Number(e.target.value))
                          }
                          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#B91C1C] focus:outline-none"
                        />
                        <p className="mt-0.5 text-xs text-gray-400">
                          Applied to annual billing (0–100).
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={savingPricing || templatesLoading}
          onClick={() => void handleSavePricing()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
        >
          {savingPricing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save pricing
        </button>
        <button
          type="button"
          disabled={savingAllowlist || templatesLoading}
          onClick={() => void handleSaveAllowlist()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {savingAllowlist ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save allowed templates
        </button>
      </div>
    </div>
  );
}
