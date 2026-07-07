'use client';

export function ServiceSelector({ servicesByCategory, selectedServiceIds, onToggleService }) {
  if (servicesByCategory.size === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        No AWS services are available in the catalog yet. Restart the cloud-automation-aws service
        or run <code className="text-xs">npm run seed</code> in the cloud_automation_aws folder.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {Array.from(servicesByCategory.entries()).map(([categoryName, services]) => (
        <div key={categoryName}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {categoryName}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((service) => {
              const checked = selectedServiceIds.includes(service._id);
              return (
                <label
                  key={service._id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    checked
                      ? 'border-[#B91C1C] bg-red-50/50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleService(service._id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{service.name}</span>
                    {service.description && (
                      <span className="mt-0.5 block text-xs text-gray-400">{service.description}</span>
                    )}
                    {service.pricingType === 'instance' && (
                      <span className="mt-0.5 block text-xs text-gray-400">
                        Instance selection required
                      </span>
                    )}
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
