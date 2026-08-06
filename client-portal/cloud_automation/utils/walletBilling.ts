/** Default USD→INR rate when wallet API does not return one. Override via core-api USD_TO_INR_RATE. */
export const DEFAULT_USD_TO_INR_RATE = 95.12;

export function convertUsdToInr(
  amountUsd: number | null | undefined,
  rate: number = DEFAULT_USD_TO_INR_RATE
): number | null {
  if (amountUsd == null || !Number.isFinite(amountUsd)) {
    return null;
  }
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_TO_INR_RATE;
  return Math.round(amountUsd * safeRate * 100) / 100;
}

export function formatInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}
