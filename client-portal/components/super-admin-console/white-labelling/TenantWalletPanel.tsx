'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wallet as WalletIcon } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchTenantManualCredits,
  fetchTenantWalletBalance,
  fetchTenantWalletTransactions,
  manualCreditTenantWallet,
} from '@/lib/tenantApi';
import type {
  ManualWalletCredit,
  ManualWalletPaymentMethod,
  SuperAdminWalletTransaction,
  TenantWalletBalance,
} from '@/lib/tenantTypes';
import {
  formatManualPaymentMethod,
  formatWalletTransactionReason,
} from '@/lib/walletTransactionLabels';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';

interface TenantWalletPanelProps {
  tenantId: string;
  onFlash: (msg: string) => void;
  onFlashErr: (msg: string) => void;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const PAYMENT_METHODS: Array<{ value: ManualWalletPaymentMethod; label: string }> = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export function TenantWalletPanel({ tenantId, onFlash, onFlashErr }: TenantWalletPanelProps) {
  const [wallet, setWallet] = useState<TenantWalletBalance | null>(null);
  const [transactions, setTransactions] = useState<SuperAdminWalletTransaction[]>([]);
  const [credits, setCredits] = useState<ManualWalletCredit[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [creditPage, setCreditPage] = useState(1);
  const [creditTotal, setCreditTotal] = useState(0);
  const limit = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ManualWalletPaymentMethod>('upi');
  const [internalNote, setInternalNote] = useState('');

  const loadWallet = useCallback(async () => {
    const data = await fetchTenantWalletBalance(tenantId);
    setWallet(data);
    return data;
  }, [tenantId]);

  const loadTransactions = useCallback(
    async (page: number) => {
      const data = await fetchTenantWalletTransactions(tenantId, page, limit);
      setTransactions(data.transactions);
      setTxTotal(data.total);
      setTxPage(data.page);
    },
    [tenantId]
  );

  const loadCredits = useCallback(
    async (page: number) => {
      const data = await fetchTenantManualCredits(tenantId, page, limit);
      setCredits(data.credits);
      setCreditTotal(data.total);
      setCreditPage(data.page);
    },
    [tenantId]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadWallet(), loadTransactions(1), loadCredits(1)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load wallet.');
    } finally {
      setLoading(false);
    }
  }, [loadWallet, loadTransactions, loadCredits]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Enter a valid amount.');
      return;
    }

    const ref = paymentReference.trim();
    if (ref.length < 6 || ref.length > 64) {
      setFormError('Payment reference must be 6–64 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await manualCreditTenantWallet(
        tenantId,
        {
          amount: parsedAmount,
          paymentReference: ref,
          paymentMethod,
          internalNote: internalNote.trim() || undefined,
        },
        crypto.randomUUID()
      );

      setWallet(result.wallet);
      setAmount('');
      setPaymentReference('');
      setInternalNote('');
      onFlash(
        result.idempotentReplay
          ? 'Credit already applied (idempotent replay).'
          : `Credited ${formatMoney(result.credit.amount, result.credit.currency)} to tenant wallet.`
      );
      await Promise.all([loadTransactions(1), loadCredits(1)]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError('This payment reference has already been credited.');
      } else {
        const msg = err instanceof ApiError ? err.message : 'Manual credit failed.';
        setFormError(msg);
        onFlashErr(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !wallet) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white" />
        <TableSkeleton rows={4} cols={5} />
      </div>
    );
  }

  if (error && !wallet) {
    return <ErrorState title="Wallet unavailable" message={error} onRetry={() => void loadAll()} />;
  }

  const txTotalPages = Math.max(1, Math.ceil(txTotal / limit));
  const creditTotalPages = Math.max(1, Math.ceil(creditTotal / limit));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Tenant wallet balance</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {wallet ? formatMoney(wallet.balance, wallet.currency) : '—'}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Credit offline payments after verifying UPI, bank transfer, or cash.
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-100 bg-red-50">
            <WalletIcon className="h-6 w-6 text-[#B91C1C]" />
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Manual credit</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Super-admin only. Payment reference must be unique platform-wide.
          </p>
        </div>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {formError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="credit-amount" className="mb-1 block text-xs font-medium text-gray-700">
              Amount (INR)
            </label>
            <input
              id="credit-amount"
              type="number"
              min={1}
              step={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              placeholder="5000"
              disabled={submitting}
            />
          </div>
          <div>
            <label
              htmlFor="credit-method"
              className="mb-1 block text-xs font-medium text-gray-700"
            >
              Payment method
            </label>
            <select
              id="credit-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as ManualWalletPaymentMethod)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              disabled={submitting}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="credit-ref" className="mb-1 block text-xs font-medium text-gray-700">
              Payment reference
            </label>
            <input
              id="credit-ref"
              type="text"
              required
              minLength={6}
              maxLength={64}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-[#B91C1C] focus:outline-none"
              placeholder="412345678901 or UTR / receipt ID"
              disabled={submitting}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="credit-note" className="mb-1 block text-xs font-medium text-gray-700">
              Internal note (optional)
            </label>
            <textarea
              id="credit-note"
              rows={2}
              maxLength={500}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none"
              placeholder="Verified in bank app"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Credit wallet
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Manual credits audit</h2>
        </div>
        {credits.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">No manual credits yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((credit) => (
                  <tr key={credit.id} className="border-b border-gray-50 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatMoney(credit.amount, credit.currency)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {credit.paymentReference}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatManualPaymentMethod(credit.paymentMethod)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{credit.internalNote ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(credit.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {creditTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
            <button
              type="button"
              disabled={creditPage <= 1}
              onClick={() => void loadCredits(creditPage - 1)}
              className="text-sm text-gray-600 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Page {creditPage} of {creditTotalPages}
            </span>
            <button
              type="button"
              disabled={creditPage >= creditTotalPages}
              onClick={() => void loadCredits(creditPage + 1)}
              className="text-sm text-gray-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Wallet transactions</h2>
        </div>
        {transactions.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Balance after</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 capitalize text-gray-700">{tx.type}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {wallet ? formatMoney(tx.amount, wallet.currency) : tx.amount}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatWalletTransactionReason(tx.reason)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {wallet ? formatMoney(tx.balanceAfter, wallet.currency) : tx.balanceAfter}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {txTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
            <button
              type="button"
              disabled={txPage <= 1}
              onClick={() => void loadTransactions(txPage - 1)}
              className="text-sm text-gray-600 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Page {txPage} of {txTotalPages}
            </span>
            <button
              type="button"
              disabled={txPage >= txTotalPages}
              onClick={() => void loadTransactions(txPage + 1)}
              className="text-sm text-gray-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
