'use client';

import { Check, Info } from 'lucide-react';
import type { CatalogInstance } from '../../types/catalog';
import { parseInstanceGuide } from '../../utils/requestForm';

function resolveHourlyPrice(instance: CatalogInstance): number | null {
  const direct =
    instance.hourlyPrice ??
    instance.hourly_price ??
    ((instance.dailyPrice ?? instance.daily_price) != null
      ? Number(instance.dailyPrice ?? instance.daily_price) / 24
      : null);

  if (direct == null || Number.isNaN(Number(direct))) return null;
  return Number(direct);
}

interface InstanceOptionCardProps {
  instance: CatalogInstance;
  selected: boolean;
  onSelect: () => void;
}

export function InstanceOptionCard({ instance, selected, onSelect }: InstanceOptionCardProps) {
  const parsed = parseInstanceGuide(instance.guide, instance.option_name);
  const price = resolveHourlyPrice(instance);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex h-full w-full flex-col rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-[#B91C1C] bg-red-50/60 ring-2 ring-[#B91C1C]/25 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{instance.option_name}</span>
            {parsed.tier ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  selected
                    ? 'bg-[#B91C1C] text-white'
                    : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                }`}
              >
                {parsed.tier}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{parsed.summary}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {selected ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B91C1C] text-white">
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {price != null ? (
            <span className="rounded-md bg-gray-900 px-2 py-1 text-xs font-semibold text-white">
              ${price.toFixed(3)}/hr
            </span>
          ) : null}
        </div>
      </div>

      {parsed.description ? (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">{parsed.description}</p>
      ) : null}

      {parsed.specs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {parsed.specs.map((spec) => (
            <span
              key={`${spec.label}-${spec.value}`}
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                selected
                  ? 'border-[#B91C1C]/20 bg-white text-gray-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              <span className="text-gray-400">{spec.label}</span>
              <span className="ml-1 text-gray-800">{spec.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {parsed.portalTips.length > 0 ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2.5 ${
            selected
              ? 'border-amber-200 bg-amber-50/90'
              : 'border-amber-100 bg-amber-50/50'
          }`}
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 text-amber-700" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Azure Portal guidance
            </p>
          </div>
          <ul className="space-y-1.5">
            {parsed.portalTips.map((tip) => (
              <li key={tip} className="flex gap-2 text-[11px] leading-relaxed text-amber-900">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </button>
  );
}
