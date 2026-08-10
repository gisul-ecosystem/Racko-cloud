'use client';

import { Layers } from 'lucide-react';
import { optionCardClass, checkboxClass } from './formStyles';

export function ServiceSelector({ servicesByCategory, selectedServiceIds, onToggleService }) {
  if (servicesByCategory.size === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center">
        <Layers className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-600">No Gcp services in the catalog yet</p>
        <p className="mt-1 text-xs text-gray-400">
          Restart cloud-automation-Gcp or run{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">npm run seed</code> in the
          cloud_automation_gcp folder.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(servicesByCategory.entries()).map(([categoryName, services]) => (
        <div key={categoryName}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {categoryName}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((service) => {
              const checked = selectedServiceIds.includes(service._id);
              return (
                <label
                  key={service._id}
                  className={`flex cursor-pointer items-start gap-3 ${optionCardClass(checked)}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleService(service._id)}
                    className={`mt-0.5 ${checkboxClass}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{service.name}</span>
                    {service.description ? (
                      <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                        {service.description}
                      </span>
                    ) : null}
                    {service.pricingType === 'instance' ? (
                      <span className="mt-2 inline-flex rounded-full bg-[var(--cloud-accent-soft,#fef2f2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--cloud-accent,#B91C1C)]">
                        Instance required
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
