/**
 * USD → INR for Azure per-user budgets.
 * Azure Cost Management for this subscription returns spend in INR, so
 * user-entered USD budgets must be converted before storage/enforcement.
 *
 * Override with env USD_TO_INR_RATE (same as core-api wallet).
 */
const DEFAULT_USD_TO_INR_RATE = 95.12;

const getUsdToInrRate = () => {
  const configured = Number(process.env.USD_TO_INR_RATE);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_USD_TO_INR_RATE;
};

const convertUsdToInr = (amountUsd, rate = getUsdToInrRate()) => {
  const usd = Number(amountUsd);
  if (!Number.isFinite(usd)) {
    return null;
  }

  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_TO_INR_RATE;
  return Math.round(usd * safeRate * 100) / 100;
};

module.exports = {
  DEFAULT_USD_TO_INR_RATE,
  getUsdToInrRate,
  convertUsdToInr
};
