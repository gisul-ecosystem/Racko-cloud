'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Loader2, Plus, Wallet as WalletIcon } from 'lucide-react';
import Link from 'next/link';
import { ApiError } from '@/lib/apiClient';
import {
  getAdminWalletByUserId,
  creditAdminWallet,
} from '@/lib/adminBillingApi';
import { apiRequest } from '@/lib/apiClient';
import type { AdminWallet, AdminWalletTransaction } from '@/types/adminBilling';

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const REASON_LABELS: Record<string, string> = {
  vm_creation: 'VM Creation',
  manual_credit: 'Manual Credit',
  razorpay_topup: 'Razorpay Top-up',
  refund: 'Refund',
};

interface AdminWalletTransactionsResult {
  transactions: AdminWalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminWalletsPage() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const email = searchParams.get('email') ?? userId;

  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [transactions, setTransactions] = useState<AdminWalletTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [crediting, setCrediting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!userId) return;
    const w = await getAdminWalletByUserId(userId);
    setWallet(w);
  }, [userId]);

  const loadTransactions = useCallback(async (p: number) => {
    if (!userId) return;
    setTxLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; data: AdminWalletTransactionsResult }>(
        `/api/v1/admin-billing/wallet/${userId}/transactions?page=${p}&limit=${limit}`
      );
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
      setPage(res.data.page);
    } finally {
      setTxLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    Promise.all([loadWallet(), loadTransactions(1)])
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load wallet.'))
      .finally(() => setLoading(false));
  }, [userId, loadWallet, loadTransactions]);

  async function handleCredit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !userId) return;
    setCrediting(true);
    setFlash(null);
    try {
      await creditAdminWallet(userId, amount);
      await Promise.all([loadWallet(), loadTransactions(1)]);
      setCreditAmount('');
      setFlash(`₹${amount.toLocaleString('en-IN')} credited successfully.`);
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Credit failed.');
    } finally {
      setCrediting(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  if (!userId) {
    return (
      <div className="p-8 text-sm text-gray-500">
        No user selected. <Link href="/super-admin-console" className="text-[#B91C1C] hover:underline">Go back</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/super-admin-console"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]">
          <ArrowLeft className="h-3 w-3" /> Back to console
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Admin Wallet</h1>
        <p className="mt-0.5 text-sm text-gray-500 truncate">{email}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {flash && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{flash}</div>
      )}

      {/* Wallet card + credit form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
              <WalletIcon className="h-6 w-6 text-[#B91C1C]" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Wallet Balance</p>
              {loading ? (
                <div className="mt-1 h-7 w-28 animate-pulse rounded bg-gray-100" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {wallet ? formatMoney(wallet.balance) : '—'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-3 text-xs font-semibold text-gray-700 uppercase tracking-wide">Manual Credit</p>
          <form onSubmit={(e) => void handleCredit(e)} className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Amount (₹)"
              className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <button
              type="submit"
              disabled={crediting || !creditAmount || Number(creditAmount) <= 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
            >
              {crediting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add credit
            </button>
          </form>
          <p className="mt-1.5 text-xs text-gray-400">Directly credits the admin wallet without payment gateway.</p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Transaction History</h2>
            <p className="mt-0.5 text-xs text-gray-400">{total} transaction{total !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading || txLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">
            No transactions yet.
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      tx.type === 'credit' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      {tx.type === 'credit'
                        ? <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        : <ArrowUpRight className="h-4 w-4 text-red-500" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {REASON_LABELS[tx.reason] ?? tx.reason}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(tx.createdAt)}</p>
                      {tx.relatedVmJobId && (
                        <p className="text-xs text-gray-400 font-mono">Job: {tx.relatedVmJobId}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${
                      tx.type === 'credit' ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {tx.type === 'credit' ? '+' : '−'}{formatMoney(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-400">Bal: {formatMoney(tx.balanceAfter)}</p>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                <button disabled={page <= 1} onClick={() => void loadTransactions(page - 1)}
                  className="text-xs text-[#B91C1C] hover:underline disabled:opacity-40 disabled:no-underline">
                  ← Previous
                </button>
                <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => void loadTransactions(page + 1)}
                  className="text-xs text-[#B91C1C] hover:underline disabled:opacity-40 disabled:no-underline">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
