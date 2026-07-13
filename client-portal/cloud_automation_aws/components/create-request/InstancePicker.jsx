'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { getPricing } from '../../api/client';
import { FLAT_RATE_INFO } from '../../config/iamPolicies';
import { getInstanceDescription } from '../../config/instanceDescriptions';
import { optionCardClass } from './formStyles';

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

  if (instanceServices.length === 0 && flatRateServices.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Select services in the previous step to choose instance sizes.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {instanceServices.map((service) => {
        const options = pricingMap[service._id] ?? [];
        const loading = loadingMap[service._id];
        const selected = selectedInstances.find((entry) => entry.serviceId === service._id);

        return (
          <div key={service._id}>
            <p className="mb-3 text-sm font-semibold text-gray-900">{service.name}</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
                Loading live pricing…
              </div>
            ) : options.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                No pricing available for this region yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {options.map((option) => {
                  const active = selected?.instanceType === option.instanceType;
                  const description = getInstanceDescription(option.instanceType);
                  return (
                    <button
                      key={option.instanceType}
                      type="button"
                      onClick={() => onSelectInstance(service._id, option.instanceType)}
                      className={optionCardClass(active)}
                    >
                      <span className="block text-sm font-semibold text-gray-900">
                        {option.instanceType}
                      </span>
                      {description ? (
                        <span className="mt-1.5 block text-xs leading-relaxed text-gray-500">
                          {description}
                        </span>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                          {formatHourly(option.pricePerHour)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          {formatDaily(option.pricePerDay)}
                        </span>
                      </div>
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
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-sm text-gray-700"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 shadow-sm">
              <Info className="h-4 w-4" />
            </div>
            <span>
              <span className="font-semibold text-gray-900">{service.name}</span>
              <span className="mt-1 block text-xs leading-relaxed text-gray-500">{info}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
