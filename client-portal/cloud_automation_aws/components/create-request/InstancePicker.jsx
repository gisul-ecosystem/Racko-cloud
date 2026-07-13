'use client';

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { getPricing } from '../../api/client';
import { FLAT_RATE_INFO } from '../../config/iamPolicies';
import { getInstanceDescription } from '../../config/instanceDescriptions';

function formatHourly(price) {
  return `$${Number(price).toFixed(4)}/hr`;
}

function formatDaily(price) {
  return `~$${Number(price).toFixed(2)}/day`;
}

export function InstancePicker({
  instanceServices,
  flatRateServices,
  region,
  selectedInstances,
  onSelectInstance,
}) {
  const [pricingMap, setPricingMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});

  useEffect(() => {
    const services = [...instanceServices, ...flatRateServices];
    if (services.length === 0) return;

    for (const service of services) {
      setLoadingMap((prev) => ({ ...prev, [service._id]: true }));
      void getPricing(service._id, region)
        .then((options) => {
          setPricingMap((prev) => ({ ...prev, [service._id]: options }));
        })
        .catch(() => {
          setPricingMap((prev) => ({ ...prev, [service._id]: [] }));
        })
        .finally(() => {
          setLoadingMap((prev) => ({ ...prev, [service._id]: false }));
        });
    }
  }, [region, instanceServices, flatRateServices]);

  return (
    <div className="space-y-5">
      {instanceServices.map((service) => {
        const options = pricingMap[service._id] ?? [];
        const loading = loadingMap[service._id];
        const selected = selectedInstances.find((entry) => entry.serviceId === service._id);

        return (
          <div key={service._id}>
            <p className="mb-2 text-sm font-medium text-gray-900">{service.name}</p>
            {loading ? (
              <p className="text-sm text-gray-400">Loading pricing…</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-gray-400">No pricing available for this region yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {options.map((option) => {
                  const active = selected?.instanceType === option.instanceType;
                  const description = getInstanceDescription(option.instanceType);
                  return (
                    <button
                      key={option.instanceType}
                      type="button"
                      onClick={() => onSelectInstance(service._id, option.instanceType)}
                      className={`rounded-lg border p-3 text-left transition ${
                        active
                          ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)]/50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-medium text-gray-900">
                        {option.instanceType}
                      </span>
                      {description && (
                        <span className="mt-1 block text-xs leading-snug text-gray-500">
                          {description}
                        </span>
                      )}
                      <span className={`block text-xs text-gray-500 ${description ? 'mt-1.5' : 'mt-1'}`}>
                        {formatHourly(option.pricePerHour)}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-400">
                        {formatDaily(option.pricePerDay)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {flatRateServices.map((service) => {
        const info = FLAT_RATE_INFO[service.name] ?? 'Billed by usage. No instance selection needed.';
        return (
          <div
            key={service._id}
            className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-gray-700"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span>
              <span className="font-medium text-gray-900">{service.name}</span>
              {' — '}
              {info}
            </span>
          </div>
        );
      })}
    </div>
  );
}
