'use client';

import Link from 'next/link';
import type { ServiceKey, SuperAdminTenantVm } from '@/lib/tenantTypes';
import type { TenantUsageBundle } from '@/lib/tenantServiceConsole';
import { getTenantServiceManageHref } from '@/lib/tenantServiceConsole';
import type { CustomerCloudLabRequest } from '@/lib/customerCloudLabsApi';
import { OrderStatusBadge } from '@/components/tenant/OrderStatusBadge';

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function CloudLabMiniTable({ rows }: { rows: CustomerCloudLabRequest[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No lab requests yet.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b text-left text-gray-500">
          <th className="py-2 pr-3">Customer</th>
          <th className="py-2 pr-3">Region</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2">Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((lab) => (
          <tr key={`${lab.provider}-${lab.id}`} className="border-b border-gray-50">
            <td className="py-2 pr-3 font-medium text-gray-900">{lab.customerEmail}</td>
            <td className="py-2 pr-3 text-gray-600">{lab.region || '—'}</td>
            <td className="py-2 pr-3 capitalize text-gray-600">{lab.status}</td>
            <td className="py-2 text-gray-600">{formatDate(lab.createdAt || undefined)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TenantVmMiniTable({ vms }: { vms: SuperAdminTenantVm[] }) {
  if (vms.length === 0) {
    return <p className="text-sm text-gray-500">No tenant VMs yet.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b text-left text-gray-500">
          <th className="py-2 pr-3">Name</th>
          <th className="py-2 pr-3">Template</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2">Assigned to</th>
        </tr>
      </thead>
      <tbody>
        {vms.map((vm) => (
          <tr key={vm.id} className="border-b border-gray-50">
            <td className="py-2 pr-3 font-medium text-gray-900">{vm.name}</td>
            <td className="py-2 pr-3 text-gray-600">{vm.templateName}</td>
            <td className="py-2 pr-3 capitalize text-gray-600">{vm.status}</td>
            <td className="py-2 text-gray-600">{vm.assignment?.email || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TenantServiceUsagePanel({
  serviceKey,
  tenantId,
  usage,
  serviceActive,
  showActions = true,
}: {
  serviceKey: ServiceKey;
  tenantId: string;
  usage: TenantUsageBundle;
  serviceActive: boolean;
  showActions?: boolean;
}) {
  const manageHref = showActions ? getTenantServiceManageHref(serviceKey, tenantId) : null;

  if (!serviceActive) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        {showActions
          ? 'Allow this service first, then use Super Admin management to operate on behalf of this tenant.'
          : 'This service is not allowed for this tenant.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {manageHref ? (
            <Link
              href={manageHref}
              className="rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#991B1B]"
            >
              Open Super Admin management
            </Link>
          ) : (
            <p className="text-xs text-gray-500">
              No Super Admin management page for this service yet.
            </p>
          )}
        </div>
      ) : null}

      {serviceKey === 'vm-management' ? <TenantVmMiniTable vms={usage.vms} /> : null}

      {serviceKey === 'create-vm' ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2">Template</th>
                <th className="px-4 py-2">Count</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {usage.orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No VM orders yet.
                  </td>
                </tr>
              ) : (
                usage.orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{order.templateName}</td>
                    <td className="px-4 py-2 text-gray-600">{order.count}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatMoney(order.calculatedAmount)}
                    </td>
                    <td className="px-4 py-2">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-600">{formatDate(order.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {serviceKey === 'azure' ? <CloudLabMiniTable rows={usage.azureLabs} /> : null}
      {serviceKey === 'aws' ? <CloudLabMiniTable rows={usage.awsLabs} /> : null}
      {serviceKey === 'gcp' ? <CloudLabMiniTable rows={usage.gcpLabs} /> : null}

      {serviceKey === 'dedicated-server' ||
      serviceKey === 'elastic-servers' ||
      serviceKey === 'cloud-labs' ||
      serviceKey === 'machine-manager' ? (
        showActions ? (
          <p className="text-sm text-gray-500">
            Use the management link above to configure and review resources for this service.
          </p>
        ) : (
          <p className="text-sm text-gray-500">No usage records for this service yet.</p>
        )
      ) : null}
    </div>
  );
}
