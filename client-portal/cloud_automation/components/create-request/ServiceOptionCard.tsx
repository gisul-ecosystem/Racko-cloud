'use client';

import { Check, Layers, Shield } from 'lucide-react';
import type { CatalogService } from '../../types/catalog';
import { formatCatalogServicePrice } from '../../utils/formatters';

interface ServiceOptionCardProps {
  service: CatalogService;
  checked: boolean;
  onToggle: () => void;
}

export function ServiceOptionCard({ service, checked, onToggle }: ServiceOptionCardProps) {
  const servicePrice = formatCatalogServicePrice(service);
  const displayName = service.service_name || service.name;
  const description =
    service.description?.trim() ||
    (service.supports_instances
      ? 'Includes multiple instance tiers — you will choose a size in the next step.'
      : 'Provisioned with default catalog roles and regional pricing.');

  return (
    <label
      className={`group flex h-full cursor-pointer flex-col rounded-xl border p-4 transition ${
        checked
          ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] ring-2 ring-[var(--cloud-accent,#B91C1C)]/25 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-[var(--cloud-accent,#B91C1C)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold leading-snug text-gray-900">{displayName}</span>
            {checked ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cloud-accent,#B91C1C)] text-white">
                <Check className="h-3 w-3" />
              </span>
            ) : null}
          </div>

          {service.category ? (
            <span className="mt-1.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {service.category}
            </span>
          ) : null}

          <p className="mt-2 text-xs leading-relaxed text-gray-500">{description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {servicePrice ? (
              <span className="rounded-md bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white">
                {servicePrice}
              </span>
            ) : null}
            {service.supports_instances ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <Layers className="h-3 w-3" />
                Instance tiers
              </span>
            ) : null}
            {service.role_required !== false && (service.default_role || service.azure_role) ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                <Shield className="h-3 w-3" />
                {service.default_role || service.azure_role}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </label>
  );
}
