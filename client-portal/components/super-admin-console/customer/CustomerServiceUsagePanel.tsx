'use client';

import Link from 'next/link';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import type { CustomerUsageBundle } from '@/lib/customerServiceConsole';
import {
  getCustomerServiceManageHref,
} from '@/lib/customerServiceConsole';
import { formatCatalogVmStatus } from '@/lib/vmCatalogApi';
import { formatDedicatedStatus } from '@/lib/dedicatedServerApi';
import type { CustomerCloudLabRequest } from '@/lib/customerCloudLabsApi';
import { CustomerVmTable } from './CustomerVmTable';

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

export function CustomerServiceUsagePanel({
  serviceKey,
  customerId,
  email,
  usage,
  serviceActive,
  showActions = true,
}: {
  serviceKey: AdminServiceKey;
  customerId: string;
  email: string;
  usage: CustomerUsageBundle;
  serviceActive: boolean;
  /** When false (Usage tab), hide SA/org create links — read-only usage view. */
  showActions?: boolean;
}) {
  const manageHref = showActions
    ? getCustomerServiceManageHref(serviceKey, customerId, email)
    : null;

  if (!serviceActive) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        {showActions
          ? 'Allow this service first, then use Super Admin management to operate on behalf of this customer.'
          : 'This service is not allowed for this customer.'}
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

      {serviceKey === 'vm-management' ? (
        <CustomerVmTable
          vms={usage.vms}
          manageHref={showActions ? (manageHref ?? undefined) : undefined}
          compact
        />
      ) : null}

      {serviceKey === 'create-vm' ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Billing</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Requested</th>
              </tr>
            </thead>
            <tbody>
              {usage.catalogRequests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No catalog VM requests.
                  </td>
                </tr>
              ) : (
                usage.catalogRequests.map((req) => (
                  <tr key={req._id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{req.planName}</td>
                    <td className="px-4 py-2 capitalize text-gray-600">{req.billing}</td>
                    <td className="px-4 py-2 text-gray-600">{formatCatalogVmStatus(req.status)}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDate(req.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {serviceKey === 'dedicated-server' ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Requested</th>
              </tr>
            </thead>
            <tbody>
              {usage.dedicatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                    No dedicated server requests.
                  </td>
                </tr>
              ) : (
                usage.dedicatedRequests.map((req) => (
                  <tr key={req._id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {req.planName || req.planId || '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{formatDedicatedStatus(req.status)}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDate(req.createdAt)}</td>
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

      {serviceKey === 'elastic-servers' ||
      serviceKey === 'cloud-labs' ||
      serviceKey === 'machine-manager' ? (
        showActions ? (
          <p className="text-sm text-gray-500">
            Use the management link above to create and review resources for this service.
          </p>
        ) : (
          <p className="text-sm text-gray-500">No usage records for this service yet.</p>
        )
      ) : null}

      {serviceKey === 'azure' || serviceKey === 'aws' ? (
        <p className="text-xs text-gray-400">
          Charged amounts appear in Billing when labs are provisioned.
          {usage.azureLabs.some((l) => l.chargedInr != null) ||
          usage.awsLabs.some((l) => l.chargedInr != null)
            ? ` Latest charges: ${[
                ...usage.azureLabs,
                ...usage.awsLabs,
              ]
                .filter((l) => l.chargedInr != null)
                .slice(0, 3)
                .map((l) => formatMoney(l.chargedInr!))
                .join(', ')}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
