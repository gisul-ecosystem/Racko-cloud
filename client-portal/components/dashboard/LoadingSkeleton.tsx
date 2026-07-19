export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
      </div>
      <div className="h-7 w-16 bg-gray-200 rounded mt-1" />
      <div className="h-2 w-full bg-gray-100 rounded-full mt-3" />
    </div>
  );
}

export function TableSkeleton({
  rows = 4,
  cols = 6,
  embedded = false,
}: {
  rows?: number;
  cols?: number;
  embedded?: boolean;
}) {
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 w-16 bg-gray-200 rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-gray-50">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div className="h-3 bg-gray-100 rounded" style={{ width: `${60 + (c * 10) % 40}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return <div className="animate-pulse">{table}</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-pulse">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
      {table}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      {/* Tables */}
      <TableSkeleton rows={3} cols={7} />
      <TableSkeleton rows={5} cols={8} />
      <TableSkeleton rows={4} cols={6} />
    </div>
  );
}
