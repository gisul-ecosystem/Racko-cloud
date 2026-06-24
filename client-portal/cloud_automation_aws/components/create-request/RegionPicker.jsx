'use client';

import { useEffect, useState } from 'react';
import { AWS_REGIONS } from '../../constants';
import { getRegions } from '../../api/client';

export function RegionPicker({ region, onRegionChange }) {
  const [regions, setRegions] = useState(AWS_REGIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getRegions()
      .then((entries) => {
        if (entries.length > 0) {
          setRegions(
            entries.map((entry) => {
              const known = AWS_REGIONS.find((item) => item.code === entry.code);
              return {
                code: entry.code,
                name: entry.name,
                location: known?.location ?? entry.name.split('(')[0]?.trim() ?? entry.name,
              };
            })
          );
        }
      })
      .catch(() => {
        setRegions(AWS_REGIONS);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading regions…</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {regions.map((entry) => {
        const active = region === entry.code;
        const subtitle = entry.name.includes('(')
          ? entry.name.slice(entry.name.indexOf('('))
          : '';

        return (
          <button
            key={entry.code}
            type="button"
            onClick={() => onRegionChange(entry.code)}
            className={`rounded-lg border p-4 text-left transition ${
              active
                ? 'border-[#B91C1C] bg-red-50/50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{entry.code}</span>
            <span className="mt-1 block text-xs text-gray-500">{entry.location}</span>
            {subtitle && <span className="mt-0.5 block text-xs text-gray-400">{subtitle}</span>}
          </button>
        );
      })}
    </div>
  );
}
