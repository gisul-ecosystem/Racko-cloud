'use client';

import { DEFAULT_IAM_POLICIES, SERVICE_IAM_POLICIES } from '../../config/iamPolicies';

function getEffectivePolicies(serviceName, overrides) {
  if (overrides?.length) return overrides;
  const defaultPolicy = DEFAULT_IAM_POLICIES[serviceName];
  return defaultPolicy ? [defaultPolicy] : [];
}

export function PermissionsPicker({ selectedServices, permissionOverrides, onPermissionChange }) {
  return (
    <div className="space-y-5">
      {selectedServices.map((service) => {
        const available = SERVICE_IAM_POLICIES[service.name] ?? [];
        const overrides = permissionOverrides[service._id] ?? [];
        const effective = getEffectivePolicies(service.name, overrides);
        const defaultPolicy = DEFAULT_IAM_POLICIES[service.name];

        return (
          <div key={service._id} className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{service.name}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {effective.map((policy) => (
                <span
                  key={policy}
                  className="rounded-full border border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] px-3 py-1 text-xs font-medium text-[var(--cloud-accent,#B91C1C)]"
                >
                  {policy}
                </span>
              ))}
            </div>

            {available.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="mb-2 text-xs text-gray-500">Override policies for {service.name}</p>
                <div className="flex flex-wrap gap-2">
                  {available.map((policy) => {
                    const isDefault = policy === defaultPolicy && overrides.length === 0;
                    const isOverrideSelected = overrides.includes(policy);
                    const active = isDefault || isOverrideSelected;

                    return (
                      <button
                        key={policy}
                        type="button"
                        onClick={() => {
                          if (policy === defaultPolicy) {
                            onPermissionChange(service._id, []);
                            return;
                          }

                          onPermissionChange(
                            service._id,
                            isOverrideSelected ? [] : [policy]
                          );
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)]'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {policy}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { getEffectivePolicies };
