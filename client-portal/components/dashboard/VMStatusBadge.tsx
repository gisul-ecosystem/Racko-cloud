import type { VMStatus } from '../../lib/vmApi';

const statusConfig: Record<VMStatus, { label: string; dot: string; badge: string }> = {
  running:   { label: 'Running',   dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200' },
  stopped:   { label: 'Stopped',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  creating:  { label: 'Creating',  dot: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  paused:    { label: 'Paused',    dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  suspended: { label: 'Suspended', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  error:     { label: 'Error',     dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200' },
  deleting:  { label: 'Deleting',  dot: 'bg-red-400',    badge: 'bg-red-50 text-red-600 border-red-200' },
  deleted:   { label: 'Deleted',   dot: 'bg-gray-300',   badge: 'bg-gray-100 text-gray-400 border-gray-200' },
};

export function VMStatusBadge({ status }: { status: VMStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.error;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function CloneTypeBadge({ type }: { type: 'dedicated_storage' | 'dynamic_storage' }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
      type === 'dedicated_storage'
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-teal-50 text-teal-700 border-teal-200'
    }`}>
      {type === 'dedicated_storage' ? 'Dedicated' : 'Dynamic'}
    </span>
  );
}

export function UsageBar({ pct, className = '' }: { pct: number; className?: string }) {
  const color = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-9 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}
