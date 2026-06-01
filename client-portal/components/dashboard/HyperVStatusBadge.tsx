import type { HyperVStatus } from '../../lib/vmApi';

const config: Record<HyperVStatus, { label: string; dot: string; badge: string }> = {
  disabled: { label: 'Virtualization Off', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  pending:  { label: 'Virtualization Pending', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  enabling: { label: 'Enabling…', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  enabled:  { label: 'Virtualization On', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' },
  failed:   { label: 'Virtualization Failed', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200' },
};

export function HyperVStatusBadge({ status }: { status: HyperVStatus }) {
  const cfg = config[status] ?? config.disabled;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/**
 * Whether a Proxmox ostype represents a Windows guest (Hyper-V is Windows-only).
 * Matches win7, win8, win10, win11, w2k variants, wvista, wxp.
 * `l26` etc. are Linux and are excluded.
 */
export function isWindowsTemplate(osType?: string): boolean {
  if (!osType) return false;
  const t = osType.toLowerCase();
  return t.startsWith('win') || t.startsWith('w2k') || t === 'wvista' || t === 'wxp';
}
