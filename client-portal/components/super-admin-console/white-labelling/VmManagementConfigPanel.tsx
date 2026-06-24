'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchVmManagementPlatformTemplates,
  updateVmManagementAllowedTemplates,
  updateVmManagementPricing,
} from '@/lib/tenantApi';
import type { VmManagementPricing, VmManagementPlatformTemplates } from '@/lib/tenantTypes';

interface VmManagementConfigPanelProps {
  tenantId: string;
  initialPricing: VmManagementPricing;
  onPricingSaved?: (pricing: VmManagementPricing) => void;
  onTemplatesSaved?: () => void;
  onFlash?: (msg: string) => void;
  onFlashErr?: (msg: string) => void;
}

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
  const [savingTemplates, setSavingTemplates] = useState(false);

  const [pricing, setPricing] = useState<VmManagementPricing>(initialPricing);
  const [savingPricing, setSavingPricing] = useState(false);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const data = await fetchVmManagementPlatformTemplates(tenantId);
      setPlatformTemplates(data);
      setAllEnabled(data.selectionMode === 'all_enabled');
      setSelectedIds(
        new Set(
          data.templates.filter((t) => t.selected).map((t) => t.templateId)
        )
      );
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Failed to load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  }, [tenantId, onFlashErr]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setPricing(initialPricing);
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

  async function handleSaveTemplates() {
    setSavingTemplates(true);
    try {
      await updateVmManagementAllowedTemplates(
        tenantId,
        allEnabled ? [] : [...selectedIds]
      );
      onFlash?.('Template allowlist saved.');
      onTemplatesSaved?.();
      await loadTemplates();
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Failed to save templates.');
    } finally {
      setSavingTemplates(false);
    }
  }

  async function handleSavePricing(e: React.FormEvent) {
    e.preventDefault();
    setSavingPricing(true);
    try {
      const config = await updateVmManagementPricing(tenantId, pricing);
      const saved: VmManagementPricing = {
        cpuRatePerCoreMonthly: Number(config.pricing['cpuRatePerCoreMonthly'] ?? pricing.cpuRatePerCoreMonthly),
        ramRatePerGbMonthly: Number(config.pricing['ramRatePerGbMonthly'] ?? pricing.ramRatePerGbMonthly),
        diskRatePerGbMonthly: Number(config.pricing['diskRatePerGbMonthly'] ?? pricing.diskRatePerGbMonthly),
        fixedPlans: Array.isArray(config.pricing['fixedPlans'])
          ? (config.pricing['fixedPlans'] as VmManagementPricing['fixedPlans'])
          : pricing.fixedPlans,
      };
      setPricing(saved);
      onPricingSaved?.(saved);
      onFlash?.('Pricing updated.');
    } catch (err) {
      onFlashErr?.(err instanceof ApiError ? err.message : 'Failed to save pricing.');
    } finally {
      setSavingPricing(false);
    }
  }

  return (
    <div className="mt-4 space-y-6 border-t border-gray-100 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Monthly pricing</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Rates used to calculate tenant order costs.
        </p>
        <form onSubmit={handleSavePricing} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['cpuRatePerCoreMonthly', 'CPU / core'],
                ['ramRatePerGbMonthly', 'RAM / GB'],
                ['diskRatePerGbMonthly', 'Disk / GB'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-gray-600">{label}</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={pricing[key]}
                  onChange={(e) =>
                    setPricing((p) => ({ ...p, [key]: Number(e.target.value) }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={savingPricing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {savingPricing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save pricing
          </button>
        </form>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Template allowlist</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Control which platform templates this tenant can order.
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

        {templatesLoading ? (
          <div className="mt-4 flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : platformTemplates && platformTemplates.templates.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No platform templates are enabled. Enable templates in the VM management catalog first.
          </p>
        ) : (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-10" />
                  <th className="px-3 py-2">Template</th>
                  <th className="px-3 py-2">Specs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {platformTemplates?.templates.map((tpl) => (
                  <tr key={tpl.templateId} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allEnabled || selectedIds.has(tpl.templateId)}
                        disabled={allEnabled}
                        onChange={() => toggleTemplate(tpl.templateId)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{tpl.name}</p>
                      <p className="text-xs text-gray-500">
                        ID {tpl.templateId} · {tpl.node}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {tpl.cpuCores} vCPU · {tpl.memoryGb} GB RAM · {tpl.diskGb} GB disk
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          disabled={savingTemplates || templatesLoading}
          onClick={() => void handleSaveTemplates()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
        >
          {savingTemplates && <Loader2 className="h-3 w-3 animate-spin" />}
          Save allowlist
        </button>
      </div>
    </div>
  );
}
