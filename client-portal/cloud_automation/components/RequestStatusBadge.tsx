const statusConfig: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
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
  active: {
    label: 'Active',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 border-green-200',
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
  error: {
    label: 'Error',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
};

function resolveConfig(status: string) {
  const key = status.trim().toLowerCase();
  return (
    statusConfig[key] ?? {
      label: status || 'Unknown',
      dot: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-600 border-gray-200',
    }
  );
}

export function RequestStatusBadge({ status }: { status: string }) {
  const cfg = resolveConfig(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
