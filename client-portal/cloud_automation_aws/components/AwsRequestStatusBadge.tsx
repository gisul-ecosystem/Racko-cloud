const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
  completed: {
    label: 'Completed',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 border-green-200',
  },
  pending: {
    label: 'Pending',
    dot: 'bg-blue-400',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  provisioning: {
    label: 'Provisioning',
    dot: 'bg-blue-400',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  processing: {
    label: 'Processing',
    dot: 'bg-blue-400',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  failed: {
    label: 'Failed',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
  error: {
    label: 'Error',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
  expired: {
    label: 'Expired',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-500 border-gray-200',
  },
  cancelled: {
    label: 'Cancelled',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-500 border-gray-200',
  },
  suspended: {
    label: 'Suspended',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

function resolveConfig(status: string) {
  const key = status.trim().toLowerCase().replace(/\s+/g, '_');

  return (
    statusConfig[key] ?? {
      label: status || 'Unknown',
      dot: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-600 border-gray-200',
    }
  );
}

export function AwsRequestStatusBadge({ status }: { status: string }) {
  const cfg = resolveConfig(status);

  return (
    <span
      className={`inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}
      title={status}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
      <span className="truncate">{cfg.label}</span>
    </span>
  );
}
