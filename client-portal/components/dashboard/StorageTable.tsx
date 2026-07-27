import type { StorageSummary } from '../../lib/proxmoxApi';

interface Props {
  storage: StorageSummary[];
}

function StatusBadge({ status }: { status: StorageSummary['status'] }) {
  const map = {
    active:   'bg-green-100 text-green-700 border-green-200',
    inactive: 'bg-red-100 text-red-700 border-red-200',
    unknown:  'bg-gray-100 text-gray-500 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-green-500' : status === 'inactive' ? 'bg-red-500' : 'bg-gray-400'}`} />
      {status}
    </span>
  );
}

function CapacityBar({ used, total, pct }: { used: number; total: number; pct: number }) {
  const color = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="min-w-[120px]">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{used.toFixed(1)} / {total.toFixed(1)} GB</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function StorageTable({ storage }: Props) {
  if (storage.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">
        No storage pools found.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Storage Pools</h2>
        <p className="text-xs text-gray-400 mt-0.5">{storage.length} pool{storage.length !== 1 ? 's' : ''} across all nodes</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Shared</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Content</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {storage.map((pool, i) => (
              <tr key={`${pool.node}-${pool.name}`} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                <td className="px-6 py-3.5 font-medium text-gray-900">{pool.name}</td>
                <td className="px-4 py-3.5">
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{pool.type}</span>
                </td>
                <td className="px-4 py-3.5 text-gray-600 text-xs">{pool.node}</td>
                <td className="px-4 py-3.5"><StatusBadge status={pool.status} /></td>
                <td className="px-4 py-3.5 text-xs text-gray-500">{pool.isShared ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {pool.content.map((c) => (
                      <span key={c} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded">
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <CapacityBar
                    used={pool.capacity.used}
                    total={pool.capacity.total}
                    pct={pool.capacity.usagePercent}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
