'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { getTenantWalletTransaction } from '@/lib/tenantPortalApi';
import { fetchTenantProject } from '@/lib/tenantProjectsApi';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  ProjectTransactionDetailView,
  type ProjectTxnDetail,
} from '@/components/console/ProjectTransactionDetail';

export default function TenantProjectTransactionDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = String(params?.id || '');
  const txId = String(params?.txId || '');
  const serviceKey = searchParams?.get('serviceKey')?.trim() || null;

  const [projectName, setProjectName] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [tx, setTx] = useState<ProjectTxnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseList = `${tenantConsole.project(projectId)}/transactions`;
  const listHref = serviceKey
    ? `${baseList}?serviceKey=${encodeURIComponent(serviceKey)}`
    : baseList;

  const load = useCallback(async () => {
    if (!projectId || !txId) return;
    setLoading(true);
    setError(null);
    try {
      const [project, transaction] = await Promise.all([
        fetchTenantProject(projectId),
        getTenantWalletTransaction(txId),
      ]);
      if (transaction.projectId && transaction.projectId !== projectId) {
        setError('This transaction does not belong to this project.');
        setTx(null);
        return;
      }
      setProjectName(project.name);
      setClientName(project.clientName);
      setTx({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        reason: transaction.reason,
        relatedRef: transaction.relatedOrderId,
        balanceAfter: transaction.balanceAfter,
        projectId: transaction.projectId ?? projectId,
        serviceKey: transaction.serviceKey ?? null,
        createdAt: transaction.createdAt,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load transaction.');
      setTx(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, txId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="max-w-screen-xl space-y-4">
        <p className="text-sm text-red-600">{error || 'Transaction not found.'}</p>
        <a href={listHref} className="text-sm font-semibold text-[#B91C1C]">
          Back to transactions
        </a>
      </div>
    );
  }

  return (
    <ProjectTransactionDetailView
      portal="tenant"
      projectId={projectId}
      projectName={projectName}
      clientName={clientName}
      backHref={listHref}
      listHref={baseList}
      tx={tx}
    />
  );
}
