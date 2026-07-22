'use client';

import { Check, Layers } from 'lucide-react';
import type { CatalogService } from '../../types/catalog';
import { formatCatalogServicePrice } from '../../utils/formatters';

interface ServiceOptionCardProps {
  service: CatalogService;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function ServiceOptionCard({
  service,
  checked,
  onToggle,
  disabled = false,
}: ServiceOptionCardProps) {
  const servicePrice = formatCatalogServicePrice(service);
  const displayName = service.service_name || service.name;
  const description =
    service.description?.trim() ||
    (service.supports_instances
      ? 'Includes multiple instance tiers — you will choose a size in the next step.'
      : 'Provisioned with default catalog roles and regional pricing.');

  return (
    <label
      title={description}
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
        disabled ? 'cursor-not-allowed opacity-80' : ''
      } ${
        checked
          ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)]'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)] disabled:cursor-not-allowed"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{displayName}</span>
          {service.supports_instances ? (
            <span
              title="Instance tiers available"
              className="inline-flex shrink-0 items-center text-blue-600"
            >
              <Layers className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {servicePrice ? (
          <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {servicePrice}
          </span>
        ) : null}
        {checked ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--cloud-accent,#B91C1C)] text-white">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </div>
    </label>
  );
}
