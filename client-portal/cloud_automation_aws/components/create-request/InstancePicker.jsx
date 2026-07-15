'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getPricing } from '../../api/client';
import { getInstanceDescription } from '../../config/instanceDescriptions';
import { optionCardClass } from './formStyles';

function formatHourly(price) {
  return `$${Number(price).toFixed(4)}/hr`;
}

function formatDaily(price) {
  return `~$${Number(price).toFixed(2)}/day`;
}

function PricingOptionCards({ service, options, loading, selected, onSelectInstance }) {
  if (loading && options.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
        Loading live pricing…
      </div>
    );
  }

  if (!loading && options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No pricing available for this region yet.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => {
        const active = selected?.instanceType === option.instanceType;
        const description =
          option.description || getInstanceDescription(option.instanceType) || option.usageHint;
        const title = option.label
          ? `${option.label}${option.usageHint ? ` · ${option.usageHint}` : ''}`
          : option.instanceType;

        return (
          <button
            key={option.instanceType}
            type="button"
            onClick={() => onSelectInstance(service._id, option.instanceType)}
            className={optionCardClass(active)}
          >
            <span className="block text-sm font-semibold text-gray-900">{title}</span>
            {option.label ? (
              <span className="mt-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {option.instanceType}
              </span>
            ) : null}
            {description ? (
              <span className="mt-1.5 block text-xs leading-relaxed text-gray-500">{description}</span>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {option.estimated || option.flatRate ? (
                <>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Lab estimate
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                    {formatDaily(option.pricePerDay)}
                  </span>
                </>
              ) : (
                <>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                    {formatHourly(option.pricePerHour)}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    {formatDaily(option.pricePerDay)}
                  </span>
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
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
  const requestVersionRef = useRef(0);

  const services = useMemo(
    () => [...instanceServices, ...flatRateServices],
    [instanceServices, flatRateServices]
  );

  // Stable key so parent re-renders (instance select, estimate refresh) do not refetch.
  const serviceIdsKey = useMemo(
    () => services.map((service) => String(service._id)).join(','),
    [services]
  );

  useEffect(() => {
    if (!region || !serviceIdsKey) return;

    const version = ++requestVersionRef.current;
    const servicesToLoad = serviceIdsKey
      .split(',')
      .map((id) => services.find((service) => String(service._id) === id))
      .filter(Boolean);

    for (const service of servicesToLoad) {
      const serviceId = service._id;
      setLoadingMap((prev) => ({ ...prev, [serviceId]: true }));

      void getPricing(serviceId, region)
        .then((options) => {
          if (requestVersionRef.current !== version) return;
          setPricingMap((prev) => ({ ...prev, [serviceId]: options }));
        })
        .catch(() => {
          if (requestVersionRef.current !== version) return;
          setPricingMap((prev) => ({ ...prev, [serviceId]: [] }));
        })
        .finally(() => {
          if (requestVersionRef.current !== version) return;
          setLoadingMap((prev) => ({ ...prev, [serviceId]: false }));
        });
    }
    // Only refetch when region or selected service ids change — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- services identity tracked via serviceIdsKey
  }, [region, serviceIdsKey]);

  if (instanceServices.length === 0 && flatRateServices.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Select services in the previous step to choose instance sizes and usage estimates.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {instanceServices.map((service) => {
        const options = pricingMap[service._id] ?? [];
        const loading = Boolean(loadingMap[service._id]);
        const selected = selectedInstances.find((entry) => entry.serviceId === service._id);

        return (
          <div key={service._id}>
            <p className="mb-3 text-sm font-semibold text-gray-900">{service.name}</p>
            <PricingOptionCards
              service={service}
              options={options}
              loading={loading}
              selected={selected}
              onSelectInstance={onSelectInstance}
            />
          </div>
        );
      })}

      {flatRateServices.length > 0 ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs leading-relaxed text-amber-900">
          Usage-based services (S3, Lambda, DynamoDB, etc.) are billed per GB or request on AWS.
          Pick a lab usage tier below so the wallet estimate includes a realistic daily allowance.
        </div>
      ) : null}

      {flatRateServices.map((service) => {
        const options = pricingMap[service._id] ?? [];
        const loading = Boolean(loadingMap[service._id]);
        const selected = selectedInstances.find((entry) => entry.serviceId === service._id);

        return (
          <div key={service._id}>
            <p className="mb-1 text-sm font-semibold text-gray-900">{service.name}</p>
            <p className="mb-3 text-xs text-gray-500">Choose an estimated usage tier for lab billing</p>
            <PricingOptionCards
              service={service}
              options={options}
              loading={loading}
              selected={selected}
              onSelectInstance={onSelectInstance}
            />
          </div>
        );
      })}
    </div>
  );
}
