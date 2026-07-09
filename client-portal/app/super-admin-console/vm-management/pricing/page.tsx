'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTemplates } from '@/hooks/useTemplates';
import { getAdminPricing, saveAdminPricing } from '@/lib/adminBillingApi';
import { ApiError } from '@/lib/apiClient';
import type { AdminTemplateRates } from '@/types/adminBilling';

const EMPTY_RATES: AdminTemplateRates = {
  cpuRatePerCoreMonthly: 0,
  ramRatePerGbMonthly: 0,
  diskRatePerGbMonthly: 0,
  billingDiscounts: { quarterly: 0, yearly: 0 },
};

export default function AdminPricingPage() {
  const { isAuthenticated } = useAuth();
  const { templates, loading: templatesLoading } = useTemplates(isAuthenticated);

  const [templatePricing, setTemplatePricing] = useState<Record<string, AdminTemplateRates>>({});
  const [pricingLoading, setPricingLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const loadPricing = useCallback(async () => {
    setPricingLoading(true);
    try {
      const data = await getAdminPricing();
      setTemplatePricing(data.templatePricing ?? {});
    } catch (err) {
      showFlash('error', err instanceof ApiError ? err.message : 'Failed to load pricing.');
    } finally {
      setPricingLoading(false);
    }
  }, []);

  useEffect(() => { void loadPricing(); }, [loadPricing]);

  function showFlash(type: 'success' | 'error', msg: string) {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 4000);
  }

  function getRates(templateId: number): AdminTemplateRates {
    return templatePricing[String(templateId)] ?? { ...EMPTY_RATES };
  }

  function setRateField(
    templateId: number,
    field: 'cpuRatePerCoreMonthly' | 'ramRatePerGbMonthly' | 'diskRatePerGbMonthly',
    value: number
  ) {
    const current = getRates(templateId);
    setTemplatePricing((prev) => ({
      ...prev,
      [String(templateId)]: { ...current, [field]: Math.round(value) },
    }));
  }

  function setDiscount(templateId: number, key: 'quarterly' | 'yearly', pct: number) {
    const clamped = Math.min(100, Math.max(0, pct));
    const current = getRates(templateId);
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

  async function handleSave() {
    setSaving(true);
    try {
      await saveAdminPricing(templatePricing);
      showFlash('success', 'Platform pricing saved.');
    } catch (err) {
      showFlash('error', err instanceof ApiError ? err.message : 'Failed to save pricing.');
    } finally {
      setSaving(false);
    }
  }

  const loading = pricingLoading || templatesLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform VM Pricing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set per-template billing rates used when admins create VMs. These rates debit the admin&apos;s personal wallet.
        </p>
      </div>

      {flash && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            flash.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          {flash.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {flash.msg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : templates.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          No enabled templates found. Enable templates first in the Templates section.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {templates.map((tpl) => {
              const p = getRates(tpl.vmid);
              const qPct = Math.round((p.billingDiscounts?.quarterly ?? 0) * 100);
              const yPct = Math.round((p.billingDiscounts?.yearly ?? 0) * 100);

              return (
                <div
                  key={tpl.vmid}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  {/* Header */}
                  <div className="border-b border-gray-100 px-5 py-3">
                    <p className="text-sm font-semibold text-gray-900">{tpl.name}</p>
                    <p className="text-xs text-gray-500">ID {tpl.vmid} · {tpl.node}</p>
                  </div>

                  {/* Rate fields */}
                  <div className="px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          ['cpuRatePerCoreMonthly', 'CPU / core (₹/mo)'],
                          ['ramRatePerGbMonthly', 'RAM / GB (₹/mo)'],
                          ['diskRatePerGbMonthly', 'Disk / GB (₹/mo)'],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field}>
                          <label className="mb-1 block text-xs text-gray-500">{label}</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={p[field]}
                            onChange={(e) => setRateField(tpl.vmid, field, Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Quarterly discount (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={qPct}
                          onChange={(e) => setDiscount(tpl.vmid, 'quarterly', Number(e.target.value))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                        />
                        <p className="mt-0.5 text-xs text-gray-400">Applied to 3-month billing (0–100).</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Yearly discount (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={yPct}
                          onChange={(e) => setDiscount(tpl.vmid, 'yearly', Number(e.target.value))}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
                        />
                        <p className="mt-0.5 text-xs text-gray-400">Applied to annual billing (0–100).</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save pricing
          </button>
        </>
      )}
    </div>
  );
}
