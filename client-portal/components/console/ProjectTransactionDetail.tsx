'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, Receipt } from 'lucide-react';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { PROJECT_SERVICE_LABELS } from '@/lib/projectsApi';
import {
  catalogVmStatusTone,
  fetchCatalogVm,
  formatCatalogVmStatus,
  type ICatalogVm,
} from '@/lib/vmCatalogApi';
import { fetchDedicatedServer, type IDedicatedServer } from '@/lib/dedicatedServerApi';
import { getRequestById, type AwsRequestRecord } from '@/cloud_automation_aws/api/client';
import { AWS_ROUTES } from '@/cloud_automation_aws/constants';
import { AZURE_ROUTES } from '@/cloud_automation/constants';
import type { ProjectPortal } from '@/lib/projectServiceMeta';
import { tenantConsole } from '@/lib/tenantAdminRoutes';

export type ProjectTxnDetail = {
  id: string;
  type: string;
  amount: number;
  reason: string;
  relatedRef: string | null;
  balanceAfter: number;
  projectId: string | null;
  serviceKey: string | null;
  createdAt: string;
};

export const REASON_LABELS: Record<string, string> = {
  vm_creation: 'VM creation',
  azure_lab_request: 'Azure lab request',
  aws_lab_request: 'AWS lab request',
  catalog_vm_purchase: 'Catalog VM purchase',
  dedicated_server_purchase: 'Dedicated server purchase',
  manual_credit: 'Manual credit',
  razorpay_topup: 'Wallet top-up',
  refund: 'Refund',
};

export function formatInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function serviceLabel(key: string | null | undefined): string {
  if (!key) return 'Unattributed';
  if (key in PROJECT_SERVICE_LABELS) {
    return PROJECT_SERVICE_LABELS[key as AdminServiceKey];
  }
  return key;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}

type LinkedResource =
  | { kind: 'catalog-vm'; data: ICatalogVm }
  | { kind: 'dedicated'; data: IDedicatedServer }
  | { kind: 'aws'; data: AwsRequestRecord }
  | { kind: 'missing'; message: string }
  | null;

async function loadLinkedResource(tx: ProjectTxnDetail): Promise<LinkedResource> {
  const ref = tx.relatedRef?.trim();
  if (!ref) return null;

  const reason = tx.reason;
  const service = tx.serviceKey;

  try {
    if (reason === 'catalog_vm_purchase' || service === 'create-vm') {
      const data = await fetchCatalogVm(ref);
      return { kind: 'catalog-vm', data };
    }
    if (reason === 'dedicated_server_purchase' || service === 'dedicated-server') {
      const data = await fetchDedicatedServer(ref);
      return { kind: 'dedicated', data };
    }
    if (reason === 'aws_lab_request' || service === 'aws') {
      const data = await getRequestById(ref);
      return { kind: 'aws', data };
    }
  } catch {
    return {
      kind: 'missing',
      message: 'Linked resource could not be loaded. It may have been removed or is unavailable.',
    };
  }

  return null;
}

export function ProjectTransactionDetailView({
  portal,
  projectId,
  projectName,
  clientName,
  backHref,
  listHref,
  tx,
}: {
  portal: ProjectPortal;
  projectId: string;
  projectName?: string | null;
  clientName?: string | null;
  backHref: string;
  listHref: string;
  tx: ProjectTxnDetail;
}) {
  const [linked, setLinked] = useState<LinkedResource>(null);
  const [linkedLoading, setLinkedLoading] = useState(Boolean(tx.relatedRef));

  useEffect(() => {
    let cancelled = false;
    if (!tx.relatedRef) {
      setLinked(null);
      setLinkedLoading(false);
      return;
    }
    setLinkedLoading(true);
    void loadLinkedResource(tx)
      .then((result) => {
        if (!cancelled) setLinked(result);
      })
      .finally(() => {
        if (!cancelled) setLinkedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tx]);

  const isDebit = tx.type === 'debit';
  const myVmsHref =
    portal === 'tenant' ? tenantConsole.createVmMyVms : '/console/create-vm/my-vms';
  const awsHref = portal === 'tenant' ? tenantConsole.aws : AWS_ROUTES.dashboard;
  const azureHref = portal === 'tenant' ? tenantConsole.azure : AZURE_ROUTES.dashboard;
  const dedicatedHref =
    portal === 'tenant'
      ? tenantConsole.dedicatedServerMyServers
      : '/console/dedicated-server/my-servers';

  return (
    <div className="mx-auto w-full max-w-screen-xl space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to transactions
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction details</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {projectName ? (
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                  {projectName}
                </span>
              ) : null}
              {tx.serviceKey ? (
                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {serviceLabel(tx.serviceKey)}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={listHref}
            className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            All transactions
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {REASON_LABELS[tx.reason] || tx.reason}
              </p>
              <p className="font-mono text-xs text-gray-400">{tx.id}</p>
            </div>
          </div>
          <p className={`text-2xl font-bold ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
            {isDebit ? '−' : '+'}
            {formatInr(tx.amount)}
          </p>
        </div>

        <dl className="px-5 py-2">
          <DetailRow label="Type" value={isDebit ? 'Debit (charge)' : 'Credit'} />
          <DetailRow label="Date" value={formatDateTime(tx.createdAt)} />
          <DetailRow label="Service" value={serviceLabel(tx.serviceKey)} />
          <DetailRow label="Reason" value={REASON_LABELS[tx.reason] || tx.reason} />
          <DetailRow
            label="Project"
            value={
              projectName ? (
                <span>
                  {projectName}
                  {clientName ? <span className="text-gray-500"> · {clientName}</span> : null}
                </span>
              ) : (
                projectId || '—'
              )
            }
          />
          <DetailRow
            label="Reference"
            value={
              tx.relatedRef ? <span className="font-mono text-xs">{tx.relatedRef}</span> : '—'
            }
          />
          <DetailRow label="Balance after" value={formatInr(tx.balanceAfter)} />
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Linked resource</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Details for the VM or request this charge belongs to
          </p>
        </div>

        {linkedLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
          </div>
        ) : !tx.relatedRef ? (
          <p className="px-5 py-8 text-sm text-gray-500">No linked resource on this transaction.</p>
        ) : linked?.kind === 'missing' ? (
          <p className="px-5 py-8 text-sm text-gray-500">{linked.message}</p>
        ) : linked?.kind === 'catalog-vm' ? (
          <div className="space-y-4 px-5 py-5">
            <dl>
              <DetailRow label="Plan" value={linked.data.planName} />
              <DetailRow label="Category" value={linked.data.category} />
              <DetailRow label="Template" value={linked.data.template?.label || '—'} />
              <DetailRow label="Billing" value={linked.data.billing} />
              <DetailRow
                label="Status"
                value={
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${catalogVmStatusTone(linked.data.status)}`}
                  >
                    {formatCatalogVmStatus(linked.data.status)}
                  </span>
                }
              />
              <DetailRow
                label="Specs"
                value={
                  [
                    linked.data.specs?.cpu ? `${linked.data.specs.cpu} CPU` : null,
                    linked.data.specs?.ram ? `${linked.data.specs.ram} RAM` : null,
                    linked.data.specs?.disk ? `${linked.data.specs.disk} disk` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'
                }
              />
              <DetailRow
                label="Hostname / IP"
                value={
                  [linked.data.hostname, linked.data.ipAddress].filter(Boolean).join(' · ') ||
                  '—'
                }
              />
              <DetailRow
                label="Purchase total"
                value={formatInr(linked.data.pricingSnapshot?.total ?? tx.amount)}
              />
            </dl>
            <Link
              href={`${myVmsHref}?projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:text-[#991B1B]"
            >
              Open My VM
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : linked?.kind === 'dedicated' ? (
          <div className="space-y-4 px-5 py-5">
            <dl>
              <DetailRow label="Plan" value={linked.data.planName || '—'} />
              <DetailRow label="Status" value={linked.data.status} />
              <DetailRow label="Location" value={linked.data.specs?.location || '—'} />
              <DetailRow
                label="Hostname / IP"
                value={
                  [linked.data.hostname, linked.data.ipAddress].filter(Boolean).join(' · ') ||
                  '—'
                }
              />
            </dl>
            <Link
              href={dedicatedHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:text-[#991B1B]"
            >
              Open dedicated servers
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : linked?.kind === 'aws' ? (
          <div className="space-y-4 px-5 py-5">
            <dl>
              <DetailRow
                label="Request ID"
                value={<span className="font-mono text-xs">{String(linked.data._id)}</span>}
              />
              <DetailRow
                label="Customer"
                value={linked.data.customerEmail || '—'}
              />
              <DetailRow label="Region" value={linked.data.region || '—'} />
              <DetailRow
                label="Accounts"
                value={String(linked.data.accountCount ?? '—')}
              />
              <DetailRow label="Status" value={linked.data.status || '—'} />
              <DetailRow
                label="Est. price"
                value={
                  linked.data.estimatedPrice != null
                    ? `$${Number(linked.data.estimatedPrice).toFixed(2)}`
                    : '—'
                }
              />
            </dl>
            <Link
              href={`${awsHref}?projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:text-[#991B1B]"
            >
              Open AWS requests
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : tx.reason === 'azure_lab_request' || tx.serviceKey === 'azure' ? (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-gray-600">
              Linked Azure request reference:{' '}
              <span className="font-mono text-xs">{tx.relatedRef}</span>
            </p>
            <Link
              href={`${azureHref}?projectId=${encodeURIComponent(projectId)}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:text-[#991B1B]"
            >
              Open Azure dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-gray-500">
            Reference recorded, but no extra resource details are available for this charge type.
          </p>
        )}
      </section>
    </div>
  );
}
