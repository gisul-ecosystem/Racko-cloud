'use client';

function formatHourly(price) {
  return `$${Number(price).toFixed(4)}/hr`;
}

export function RegionPicker({
  region,
  onRegionChange,
  regions,
  loading,
  error,
}) {
  if (loading) {
    return <p className="text-sm text-gray-400">Loading regions from AWS…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (regions.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No AWS regions found with pricing for your selected services and instances.
      </p>
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
            className={`rounded-lg border p-4 text-left transition ${
              active
                ? 'border-[#B91C1C] bg-red-50/50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{entry.code}</span>
            <span className="mt-1 block text-xs text-gray-500">{entry.location || entry.name}</span>
            {subtitle && <span className="mt-0.5 block text-xs text-gray-400">{subtitle}</span>}
            {entry.basePrice != null && (
              <span className="mt-2 block text-xs font-medium text-gray-700">
                from {formatHourly(entry.basePrice)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
