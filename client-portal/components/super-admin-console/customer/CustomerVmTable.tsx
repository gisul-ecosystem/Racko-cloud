'use client';

import Link from 'next/link';
import type { IVM } from '@/lib/vmApi';

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function CustomerVmTable({
  vms,
  manageHref,
  compact = false,
  emptyMessage = 'No VPS Hosting VMs for this customer yet.',
}: {
  vms: IVM[];
  manageHref?: string;
  compact?: boolean;
  emptyMessage?: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          VPS / managed VMs ({vms.length})
        </h2>
        {manageHref ? (
          <Link href={manageHref} className="text-xs font-medium text-[#B91C1C] hover:underline">
            Manage all →
          </Link>
        ) : null}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-5 py-3">Name</th>
            {!compact && <th className="px-4 py-3">Template</th>}
            <th className="px-4 py-3">Status</th>
            {!compact && <th className="px-4 py-3">IP</th>}
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {vms.length === 0 ? (
            <tr>
              <td colSpan={compact ? 3 : 5} className="px-5 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            vms.map((vm) => (
              <tr key={vm._id} className="border-b border-gray-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{vm.name}</p>
                  <p className="font-mono text-[11px] text-gray-400">#{vm.vmid}</p>
                </td>
                {!compact && (
                  <td className="px-4 py-3 text-gray-700">{vm.templateName}</td>
                )}
                <td className="px-4 py-3 capitalize text-gray-700">{vm.status}</td>
                {!compact && (
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {vm.ipAddress ?? '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-700">{formatDate(vm.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
