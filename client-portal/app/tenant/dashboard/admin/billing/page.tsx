'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  createTenantWalletTopup,
  getTenantWallet,
  getTenantWalletTransactions,
} from '@/lib/tenantPortalApi';
import { tenantAccentButton, hexToRgba } from '@/lib/tenantAccentStyles';
import { ApiError } from '@/lib/apiClient';
import { formatWalletTransactionReason } from '@/lib/walletTransactionLabels';
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
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TenantWalletPage() {
  const { tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  const [wallet, setWallet] = useState<TenantWallet | null>(null);
  const [transactions, setTransactions] = useState<TenantWalletTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const loadWallet = useCallback(async () => {
    const w = await getTenantWallet();
    setWallet(w);
    return w;
  }, []);

  const loadTransactions = useCallback(async (p: number) => {
    setTxLoading(true);
    try {
      const data = await getTenantWalletTransactions(p, limit);
      setTransactions(data.transactions);
      setTotal(data.total);
      setPage(data.page);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/console');
    }
  }, [router, tenantUser?.role]);

  useEffect(() => {
    if (!tenantUser || tenantUser.role === 'tenant_user') return;
    setLoading(true);
    setError(null);
    Promise.all([loadWallet(), loadTransactions(1)])
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Failed to load billing data.')
      )
      .finally(() => setLoading(false));
  }, [tenantUser, loadWallet, loadTransactions]);

  function startBalancePoll(previousBalance: number) {
    clearPoll();
    setPendingMsg('Payment received — updating balance…');
    pollRef.current = setInterval(() => {
      pollCountRef.current += 1;
      void loadWallet().then((w) => {
        if (w.balance !== previousBalance) {
          clearPoll();
          setPendingMsg(null);
          void loadTransactions(1);
        } else if (pollCountRef.current >= 10) {
          clearPoll();
          setPendingMsg('Balance may take a moment to update. Refresh if needed.');
        }
      });
    }, 3000);
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setTopupLoading(true);
    setPendingMsg(null);
    try {
      const previousBalance = wallet?.balance ?? 0;
      const data = await createTenantWalletTopup(amount);
      if (typeof window.Razorpay === 'undefined') {
        setError('Payment checkout failed to load. Please refresh and try again.');
        return;
      }
      new window.Razorpay({
        key: data.keyId,
        amount: data.amount * 100,
        currency: data.currency,
        order_id: data.razorpayOrderId,
        handler: () => startBalancePoll(previousBalance),
        theme: { color: accentColor },
      }).open();
      setTopupAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Top-up failed.');
    } finally {
      setTopupLoading(false);
    }
  }

  if (tenantUser?.role === 'tenant_user') {
    return null;
  }

  const currency = wallet?.currency || 'INR';
  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Manage your wallet and view transaction history.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: hexToRgba(accentColor, 0.1),
                  color: accentColor,
                }}
              >
                <WalletIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Wallet Balance
                </p>
                {loading ? (
                  <div className="mt-1 h-7 w-28 animate-pulse rounded bg-gray-100" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {wallet ? formatMoney(wallet.balance, currency) : '—'}
                  </p>
                )}
              </div>
            </div>

            {isAdmin ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={topupAmount}
                    disabled
                    placeholder="Amount (₹)"
                    className="w-36 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400"
                  />
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white opacity-50"
                    style={tenantAccentButton(accentColor)}
                  >
                    <Plus className="h-4 w-4" />
                    Top up
                  </button>
                </div>
                <p className="text-xs text-gray-500">Online payment — coming soon</p>
              </div>
            ) : null}
          </div>

          {pendingMsg && (
            <p className="mt-3 text-xs" style={{ color: accentColor }}>
              {pendingMsg}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Transaction History</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {total} transaction{total !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {loading || txLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500">
              No transactions yet. Top up your wallet to get started.
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          tx.type === 'credit' ? 'bg-green-50' : 'bg-red-50'
                        }`}
                      >
                        {tx.type === 'credit' ? (
                          <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {formatWalletTransactionReason(tx.reason)}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(tx.createdAt)}</p>
                        {tx.relatedOrderId ? (
                          <p className="font-mono text-xs text-gray-400">
                            Order: {tx.relatedOrderId}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          tx.type === 'credit' ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {tx.type === 'credit' ? '+' : '−'}
                        {formatMoney(tx.amount, currency)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Bal: {formatMoney(tx.balanceAfter, currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => void loadTransactions(page - 1)}
                    className="text-xs hover:underline disabled:opacity-40 disabled:no-underline"
                    style={{ color: accentColor }}
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => void loadTransactions(page + 1)}
                    className="text-xs hover:underline disabled:opacity-40 disabled:no-underline"
                    style={{ color: accentColor }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
