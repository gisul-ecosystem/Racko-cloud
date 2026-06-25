const WALLET_REASON_LABELS: Record<string, string> = {
  topup_razorpay: 'Top-up (Online)',
  topup_manual: 'Top-up (Manual)',
  order_payment: 'Order payment',
  order_refund: 'Order refund',
  plan_extend: 'Plan extension',
  plan_renew: 'Plan renewal',
};

export function formatWalletTransactionReason(reason: string): string {
  return WALLET_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

export const MANUAL_PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  other: 'Other',
};

export function formatManualPaymentMethod(method: string): string {
  return MANUAL_PAYMENT_METHOD_LABELS[method] ?? method;
}
