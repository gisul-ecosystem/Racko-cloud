const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FFF3CD', color: '#856404', label: 'Pending' },
  provisioning: { bg: '#CCE5FF', color: '#004085', label: 'Provisioning' },
  processing: { bg: '#CCE5FF', color: '#004085', label: 'Processing' },
  completed: { bg: '#D4EDDA', color: '#155724', label: 'Completed' },
  failed: { bg: '#F8D7DA', color: '#721C24', label: 'Failed' },
  expired: { bg: '#E2E3E5', color: '#383D41', label: 'Expired' },
  cancelled: { bg: '#E2E3E5', color: '#383D41', label: 'Cancelled' },
};

function resolveStyle(status: string) {
  const key = status.trim().toLowerCase();
  return (
    STATUS_STYLES[key] ?? {
      bg: '#E2E3E5',
      color: '#383D41',
      label: status || 'Unknown',
    }
  );
}

export function AwsRequestStatusBadge({ status }: { status: string }) {
  const cfg = resolveStyle(status);

  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}
