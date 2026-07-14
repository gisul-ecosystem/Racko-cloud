'use client';

import { Loader2, MapPin } from 'lucide-react';
import { optionCardClass } from './formStyles';

function formatHourly(price) {
  return `$${Number(price).toFixed(4)}/hr`;
}

export function RegionPicker({ region, onRegionChange, regions, loading, error }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin text-[#B91C1C]" />
        Loading regions from AWS…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (regions.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        No AWS regions found with pricing for your selected services and instances. Try different
        services or instance sizes.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {regions.map((entry) => {
        const active = region === entry.code;
        const subtitle = entry.name.includes('(') ? entry.name.slice(entry.name.indexOf('(')) : '';

        return (
          <button
            key={entry.code}
            type="button"
            onClick={() => onRegionChange(entry.code)}
            className={optionCardClass(active)}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MapPin className={`h-4 w-4 shrink-0 ${active ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
              {entry.code}
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-gray-500">
              {entry.location || entry.name}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block text-xs text-gray-400">{subtitle}</span>
            ) : null}
            {entry.basePrice != null ? (
              <span className="mt-3 inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#B91C1C]">
                from {formatHourly(entry.basePrice)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
