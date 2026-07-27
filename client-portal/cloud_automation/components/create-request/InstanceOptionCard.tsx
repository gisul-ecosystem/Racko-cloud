'use client';

import { Check } from 'lucide-react';
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
  disabled?: boolean;
}

export function InstanceOptionCard({
  instance,
  selected,
  onSelect,
  disabled = false,
}: InstanceOptionCardProps) {
  const parsed = parseInstanceGuide(instance.guide, instance.option_name);
  const price = resolveHourlyPrice(instance);

  const tooltipParts = [
    parsed.summary,
    parsed.description,
    parsed.specs.map((spec) => `${spec.label}: ${spec.value}`).join(' · '),
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={tooltipParts.join('\n') || undefined}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
        disabled ? 'cursor-not-allowed opacity-80' : ''
      } ${
        selected
          ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)]'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent,#B91C1C)]'
            : 'border-gray-300 bg-white'
        }`}
        aria-hidden
      >
        {selected ? <Check className="h-2.5 w-2.5 text-white" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{instance.option_name}</span>
          {parsed.tier ? (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                selected
                  ? 'bg-[var(--cloud-accent,#B91C1C)] text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {parsed.tier}
            </span>
          ) : null}
        </div>
        {parsed.specs.length > 0 ? (
          <p className="mt-0.5 truncate text-[11px] text-gray-500">
            {parsed.specs.map((spec) => `${spec.label} ${spec.value}`).join(' · ')}
          </p>
        ) : parsed.summary ? (
          <p className="mt-0.5 truncate text-[11px] text-gray-500">{parsed.summary}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {price != null ? (
          <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            ${price.toFixed(3)}/hr
          </span>
        ) : null}
        {selected ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--cloud-accent,#B91C1C)] text-white">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </div>
    </button>
  );
}
