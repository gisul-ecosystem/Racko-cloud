import { logger } from './logger';

const FALLBACK_USD_TO_INR = Number(process.env.USD_TO_INR) || 84;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRate: number | null = null;
let cachedAt = 0;
let cachedSource = 'fallback';

export interface FxMeta {
  usdToInr: number;
  source: string;
}

/**
 * Resolve USD→INR rate (cached). Prefers live frankfurter.app, else USD_TO_INR env / 84.
 */
export async function getUsdToInrRate(): Promise<FxMeta> {
  if (cachedRate != null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return { usdToInr: cachedRate, source: cachedSource };
  }

  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { INR?: number } };
    const rate = data?.rates?.INR;
    if (!rate || !Number.isFinite(rate)) throw new Error('No INR rate');
    cachedRate = rate;
    cachedAt = Date.now();
    cachedSource = 'live';
    return { usdToInr: rate, source: cachedSource };
  } catch (err) {
    logger.warn('[fx] USD→INR live fetch failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
      fallback: FALLBACK_USD_TO_INR,
    });
    cachedRate = FALLBACK_USD_TO_INR;
    cachedAt = Date.now();
    cachedSource = `fallback (${FALLBACK_USD_TO_INR})`;
    return { usdToInr: cachedRate, source: cachedSource };
  }
}

function roundHr(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface DualCurrencyPeriod {
  hr: number | null;
  monthly: number | null;
  quarterly: number | null;
  yearly: number | null;
}

export function periodFromHourlyUsd(hrUsd: number | null | undefined): DualCurrencyPeriod {
  if (hrUsd == null || !Number.isFinite(hrUsd)) {
    return { hr: null, monthly: null, quarterly: null, yearly: null };
  }
  const monthly = hrUsd * 730;
  return {
    hr: roundHr(hrUsd),
    monthly: roundMoney(monthly),
    quarterly: roundMoney(monthly * 3),
    yearly: roundMoney(monthly * 12),
  };
}

export function usdToInrPeriod(
  usd: DualCurrencyPeriod,
  rate: number
): DualCurrencyPeriod {
  const mul = (v: number | null) => (v == null ? null : roundMoney(v * rate));
  return {
    hr: usd.hr == null ? null : roundHr(usd.hr * rate),
    monthly: mul(usd.monthly),
    quarterly: mul(usd.quarterly),
    yearly: mul(usd.yearly),
  };
}

export function convertUsdAmount(
  amount: number | null | undefined,
  rate: number
): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return roundHr(amount * rate);
}
