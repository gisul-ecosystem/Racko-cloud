'use client';

const statusConfig: Record<string, { label: string; className: string }> = {
  Completed: { label: '● Active', className: 'bg-green-100 text-green-700 border-green-200' },
  Provisioning: { label: '◌ Provisioning', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  Failed: { label: '✕ Failed', className: 'bg-red-100 text-red-700 border-red-200' },
  Expired: { label: '● Expired', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  Pending: { label: '○ Pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  Active: { label: '● Active', className: 'bg-green-100 text-green-700 border-green-200' },
  Suspended: { label: '● Suspended', className: 'bg-red-100 text-red-700 border-red-200' },
};

export function GcpLabStatusBadge({ status }: { status: string }) {
  const badge = statusConfig[status] ?? {
    label: status || 'Unknown',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
