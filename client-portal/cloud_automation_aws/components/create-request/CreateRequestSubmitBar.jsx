'use client';

import { Loader2 } from 'lucide-react';
import { RACKO_BTN_PRIMARY } from '../../../components/console/cloudButtonStyles';
import { formatCurrency } from '../../../cloud_automation/utils/formatters';

export function CreateRequestSubmitBar({
  submitting,
  submitError,
  totalPrice,
  disabled = false,
  onSubmit,
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-[#B91C1C]/10">
      <div className="h-0.5 bg-gradient-to-r from-[#B91C1C] to-[#DC2626]" />
      <div className="p-6">
        <div className="mb-5 border-b border-gray-100 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
            Final step
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">Review &amp; submit</h2>
          <p className="mt-1 text-sm text-gray-500">
            Confirm your configuration below, then create the AWS lab request.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Estimated total
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {totalPrice != null ? (
                <>
                  <span className="text-[#B91C1C]">{formatCurrency(totalPrice)}</span>
                  <span className="ml-1.5 text-sm font-normal text-gray-500">USD</span>
                </>
              ) : (
                <span className="text-base font-medium text-gray-400">
                  Complete the form to estimate
                </span>
              )}
            </p>
          </div>

          <div className="w-full sm:w-auto sm:min-w-[220px]">
            {submitError ? <p className="mb-3 text-sm text-red-600">{submitError}</p> : null}
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || disabled}
              className={`w-full ${RACKO_BTN_PRIMARY} py-3`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating request…
                </>
              ) : (
                'Create request'
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
