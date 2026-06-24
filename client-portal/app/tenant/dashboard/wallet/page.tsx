'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Plus, Wallet as WalletIcon } from 'lucide-react';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  createTenantWalletTopup,
  getTenantWallet,
  getTenantWalletTransactions,
} from '@/lib/tenantPortalApi';
import { tenantAccentButton, tenantAccentSurface } from '@/lib/tenantAccentStyles';
import { ApiError } from '@/lib/apiClient';
import type { TenantWallet, TenantWalletTransaction } from '@/types/tenantPortal';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
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

export default function TenantWalletPage() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  const [wallet, setWallet] = useState<TenantWallet | null>(null);
  const [transactions, setTransactions] = useState<TenantWalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const loadWallet = useCallback(async () => {
    const data = await getTenantWallet();
    setWallet(data);
    return data;
  }, []);

  const loadTransactions = useCallback(async (p: number) => {
    const data = await getTenantWalletTransactions(p, limit);
    setTransactions(data.transactions);
    setTotal(data.total);
    setPage(data.page);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadWallet(), loadTransactions(page)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load wallet.');
    } finally {
      setLoading(false);
    }
  }, [loadWallet, loadTransactions, page]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => () => clearPoll(), [clearPoll]);

  function startBalancePoll(previousBalance: number) {
    clearPoll();
    setPendingMessage('Payment received — updating balance…');

    pollRef.current = setInterval(() => {
      pollCountRef.current += 1;
      void loadWallet().then((w) => {
        if (w.balance !== previousBalance) {
          clearPoll();
          setPendingMessage(null);
          void loadTransactions(1);
        } else if (pollCountRef.current >= 10) {
          clearPoll();
          setPendingMessage('Balance may take a moment to update. Refresh if needed.');
        }
      });
    }, 3000);
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setTopupLoading(true);
    setPendingMessage(null);
    try {
      const previousBalance = wallet?.balance ?? 0;
      const data = await createTenantWalletTopup(amount);

      if (typeof window.Razorpay === 'undefined') {
        setError('Payment checkout failed to load. Please refresh and try again.');
        return;
      }

      const options = {
        key: data.keyId,
        amount: data.amount * 100,
        currency: data.currency,
        order_id: data.razorpayOrderId,
        handler: () => startBalancePoll(previousBalance),
        theme: { color: accentColor },
      };

      new window.Razorpay(options).open();
      setTopupAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Top-up failed.');
    } finally {
      setTopupLoading(false);
    }
  }

  if (loading && !wallet) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-xl bg-white border border-gray-200" />
        <TableSkeleton rows={5} cols={5} />
      </div>
    );
  }

  if (error && !wallet) {
    return <ErrorState title="Wallet unavailable" message={error} onRetry={() => void loadAll()} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Available balance</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {wallet ? formatMoney(wallet.balance, wallet.currency) : '—'}
              </p>
            </div>
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl border"
              style={tenantAccentSurface(accentColor)}
            >
              <WalletIcon className="h-6 w-6 text-gray-600" />
            </div>
          </div>

          {pendingMessage && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {pendingMessage}
            </div>
          )}

          {isAdmin ? (
            <form onSubmit={handleTopup} className="mt-6 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-6">
              <div>
                <label htmlFor="topup" className="mb-1 block text-xs font-medium text-gray-500">
                  Add funds (INR)
                </label>
                <input
                  id="topup"
                  type="number"
                  min={1}
                  step={1}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="1000"
                  disabled={topupLoading}
                />
              </div>
              <button
                type="submit"
                disabled={topupLoading || !topupAmount}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={tenantAccentButton(accentColor)}
              >
                <Plus className="h-4 w-4" />
                {topupLoading ? 'Opening checkout…' : 'Add funds'}
              </button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              Only tenant admins can add funds. View your balance and transaction history below.
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Transactions</h2>
          </div>

          {loading ? (
            <TableSkeleton rows={4} cols={5} embedded />
          ) : transactions.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-500">No transactions yet.</p>
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
                      <td className="px-4 py-3 text-gray-600">{tx.reason}</td>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => void loadTransactions(page - 1)}
                className="text-sm text-gray-600 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => void loadTransactions(page + 1)}
                className="text-sm text-gray-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
