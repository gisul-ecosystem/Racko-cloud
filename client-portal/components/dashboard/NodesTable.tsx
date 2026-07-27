import type { NodeSummary } from '../../lib/proxmoxApi';

interface Props {
  nodes: NodeSummary[];
}

function StatusBadge({ status }: { status: NodeSummary['status'] }) {
  const map = {
    online:  'bg-green-100 text-green-700 border-green-200',
    offline: 'bg-red-100 text-red-700 border-red-200',
    unknown: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-green-500' : status === 'offline' ? 'bg-red-500' : 'bg-gray-400'}`} />
      {status}
    </span>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-9 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export function NodesTable({ nodes }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center text-gray-400 text-sm">
        No nodes found.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Nodes</h2>
          <p className="text-xs text-gray-400 mt-0.5">{nodes.length} node{nodes.length !== 1 ? 's' : ''} in cluster</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPU</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Memory</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Disk</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uptime</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node, i) => (
              <tr key={node.name} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                <td className="px-6 py-3.5 font-medium text-gray-900">{node.name}</td>
                <td className="px-4 py-3.5"><StatusBadge status={node.status} /></td>
                <td className="px-4 py-3.5">
                  <div className="space-y-0.5">
                    <p className="text-xs text-gray-400">{node.cpu.total} cores</p>
                    <UsageBar pct={node.cpu.usagePercent} />
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="space-y-0.5">
                    <p className="text-xs text-gray-400">{node.memory.used.toFixed(1)} / {node.memory.total.toFixed(1)} GB</p>
                    <UsageBar pct={node.memory.usagePercent} />
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="space-y-0.5">
                    <p className="text-xs text-gray-400">{node.disk.used.toFixed(1)} / {node.disk.total.toFixed(1)} GB</p>
                    <UsageBar pct={node.disk.usagePercent} />
                  </div>
                </td>
                <td className="px-4 py-3.5 text-gray-600 text-xs whitespace-nowrap">{node.uptime.formatted}</td>
                <td className="px-4 py-3.5 text-gray-400 text-xs">{node.proxmoxVersion ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
