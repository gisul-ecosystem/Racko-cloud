'use client';

import Link from 'next/link';
import { AlertCircle, Loader2, Wallet } from 'lucide-react';
import { RACKO_BTN_PRIMARY, RACKO_BTN_SECONDARY } from '../cloudButtonStyles';
import { formatCurrency } from '../../utils/formatters';
import { formatInr } from '../../utils/walletBilling';

interface CreateRequestSubmitBarProps {
  submitting: boolean;
  submitError: string | null;
  totalPrice: number | null;
  currency?: string;
  onSubmit: () => void;
  compact?: boolean;
  walletBalance: number | null;
  walletCurrency?: string;
  estimatedInr: number | null;
  usdToInrRate: number;
  walletLoading?: boolean;
  insufficientBalance?: boolean;
}

export function CreateRequestSubmitBar({
  submitting,
  submitError,
  totalPrice,
  currency = 'USD',
  onSubmit,
  compact = false,
  walletBalance,
  walletCurrency = 'INR',
  estimatedInr,
  usdToInrRate,
  walletLoading = false,
  insufficientBalance = false,
}: CreateRequestSubmitBarProps) {
  const hasEstimate = totalPrice != null && estimatedInr != null;
  const remaining =
    walletBalance != null && estimatedInr != null
      ? Math.max(0, walletBalance - estimatedInr)
      : null;
  const shortfall =
    walletBalance != null && estimatedInr != null && estimatedInr > walletBalance
      ? estimatedInr - walletBalance
      : null;

  return (
    <section
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${
        compact ? '' : 'ring-1 ring-[#B91C1C]/10'
      }`}
    >
      {!compact && (
        <div className="h-0.5 bg-gradient-to-r from-[#B91C1C] to-[#DC2626]" />
      )}
      <div className={compact ? 'p-5' : 'p-6'}>
        {!compact && (
          <div className="mb-5 border-b border-gray-100 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
              Final step
            </p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Review &amp; submit</h2>
            <p className="mt-1 text-sm text-gray-500">
              Estimated cost is converted to INR and deducted from your wallet when you create
              the request.
            </p>
          </div>
        )}

        <div
          className={`rounded-xl border p-4 ${
            insufficientBalance
              ? 'border-red-200 bg-red-50/70'
              : 'border-gray-100 bg-gray-50/80'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                insufficientBalance ? 'bg-red-100 text-red-600' : 'bg-red-50 text-[#B91C1C]'
              }`}
            >
              <Wallet className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Wallet balance
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {walletLoading
                  ? 'Loading…'
                  : walletBalance != null
                    ? formatInr(walletBalance)
                    : 'Unavailable'}
                {walletBalance != null ? (
                  <span className="ml-1 text-xs font-normal text-gray-400">{walletCurrency}</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-gray-200/70 pt-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">Estimate (USD)</span>
              <span className="font-medium text-gray-900">
                {totalPrice != null ? formatCurrency(totalPrice) : '—'} {currency}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">
                Charge (INR)
                <span className="ml-1 text-[11px] text-gray-400">@ ₹{usdToInrRate}/$</span>
              </span>
              <span className="font-semibold text-[#B91C1C]">
                {estimatedInr != null ? formatInr(estimatedInr) : '—'}
              </span>
            </div>
            {remaining != null && !insufficientBalance ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Balance after</span>
                <span className="font-medium text-green-700">{formatInr(remaining)}</span>
              </div>
            ) : null}
          </div>
        </div>

        {insufficientBalance ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-800">Insufficient wallet balance</p>
                <p className="mt-1 text-sm leading-relaxed text-red-700">
                  This request needs{' '}
                  <span className="font-semibold">{formatInr(estimatedInr)}</span>
                  {shortfall != null ? (
                    <>
                      {' '}
                      but you need{' '}
                      <span className="font-semibold">{formatInr(shortfall)}</span> more. Top up
                      your wallet to continue.
                    </>
                  ) : (
                    '.'
                  )}
                </p>
                <Link
                  href="/dashboard/admin/billing"
                  className={`mt-3 w-full ${RACKO_BTN_PRIMARY}`}
                >
                  Top up balance
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <div className={`mt-4 ${compact ? '' : 'sm:flex sm:items-end sm:justify-between sm:gap-4'}`}>
          {!compact && hasEstimate ? (
            <div className="mb-4 min-w-0 flex-1 sm:mb-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Estimated total
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                <span className="text-[#B91C1C]">{formatCurrency(totalPrice)}</span>
                <span className="ml-1.5 text-sm font-normal text-gray-500">{currency}</span>
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                ≈ {formatInr(estimatedInr)} deducted on create
              </p>
            </div>
          ) : !compact ? (
            <div className="mb-4 min-w-0 flex-1 sm:mb-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Estimated total
              </p>
              <p className="mt-1 text-base font-medium text-gray-400">
                Complete the form to estimate
              </p>
            </div>
          ) : null}

          <div className={compact ? 'w-full' : 'w-full sm:w-auto sm:min-w-[220px]'}>
            {submitError ? <p className="mb-3 text-sm text-red-600">{submitError}</p> : null}
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || insufficientBalance || !hasEstimate || walletLoading}
              className={`w-full ${RACKO_BTN_PRIMARY} py-3`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating request…
                </>
              ) : insufficientBalance ? (
                'Insufficient balance'
              ) : (
                'Create request'
              )}
            </button>
            {insufficientBalance ? (
              <Link
                href="/dashboard/admin/billing"
                className={`mt-2 w-full ${RACKO_BTN_SECONDARY} justify-center`}
              >
                Go to billing
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
