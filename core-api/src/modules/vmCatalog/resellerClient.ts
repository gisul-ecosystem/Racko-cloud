import { config } from '../../config';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface ResellerSelectInput {
  canonicalSpec?: string;
  category: string;
  mode?: 'vm' | 'storage_only';
  durationDays: number;
  specs?: { cpu?: string; ram?: string; disk?: string; diskType?: 'standard_hdd' | 'standard_ssd' };
  /** Limit cheapest-provider search to these clouds. Omit for all. */
  providers?: string[] | string;
  /** Backward-compatible alias for providers. */
  provider?: string[] | string;
  /** When true, select/price only nested-virt-capable SKUs. */
  nestedVirtualization?: boolean;
}

export interface ResellerSelectResult {
  provider: 'webyne' | 'aws' | 'azure' | 'gcp' | 'oci';
  region: string | null;
  category: string;
  canonicalSpec: string;
  mode?: 'vm' | 'storage_only';
  pricingMode?: 'normal' | 'nested';
  nestedVirtualization?: boolean;
  rawTotalPricePerHr: number | null;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  /** @deprecated Prefer rawPublicIpPricePerHr */
  rawIpPricePerHr?: number;
  rawPublicIpPricePerHr?: number;
  rawPrivateIpPricePerHr?: number;
  rawTotalWithPublicIpPerHr?: number;
  rawTotalWithPrivateIpPerHr?: number;
  instanceType?: string;
  currency?: string;
  autoProvisioned: boolean;
  reason?: string;
  providersUsed?: string[];
}

export interface ResellerProvisionInput {
  provider: string;
  region?: string | null;
  category: string;
  canonicalSpec: string;
  catalogVmId: string;
}

export interface ResellerProvisionResult {
  provider: string;
  providerInstanceId: string;
  region: string;
  ip: string | null;
  hostname?: string | null;
  username: string;
  password: string;
  protocol: 'ssh' | 'rdp';
}

export interface ResellerTerminateInput {
  provider: string;
  region?: string | null;
  providerInstanceId: string;
}

export type ResellerClientError = Error & { status?: number; code?: string };

function resellerBaseUrl(): string {
  return String(config.RESELLER_SERVICE_URL || 'http://127.0.0.1:3005').replace(/\/$/, '');
}

async function postReseller<T>(
  path: string,
  body: unknown,
  logLabel: string,
  /** 0 = no client-side abort (wait until reseller responds). */
  timeoutMs = 300_000
): Promise<T> {
  const url = `${resellerBaseUrl()}${path}`;
  logger.info(`[Reseller] ${logLabel}`, { url, timeoutMs });

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      message?: string;
      error?: string;
    };

    if (!res.ok || data.success === false) {
      const err: ResellerClientError = new Error(
        data.message || data.error || `Reseller ${logLabel} failed (HTTP ${res.status})`
      );
      err.status = res.status;
      throw err;
    }

    return (data.data ?? data) as T;
  } catch (err) {
    if (isAbortError(err)) {
      throw new AppError(
        `Reseller ${logLabel} timed out after ${Math.round(timeoutMs / 1000)}s.`,
        504,
        'RESELLER_TIMEOUT'
      );
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'ABORT_ERR')
  );
}

async function getReseller<T>(
  path: string,
  logLabel: string,
  timeoutMs = 30_000
): Promise<T> {
  const url = `${resellerBaseUrl()}${path}`;
  logger.info(`[Reseller] ${logLabel}`, { url });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
      },
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      message?: string;
      error?: string;
    };

    if (!res.ok || data.success === false) {
      const err: ResellerClientError = new Error(
        data.message || data.error || `Reseller ${logLabel} failed (HTTP ${res.status})`
      );
      err.status = res.status;
      throw err;
    }

    return (data.data ?? data) as T;
  } catch (err) {
    if (isAbortError(err)) {
      throw new AppError(
        `Reseller ${logLabel} timed out after ${Math.round(timeoutMs / 1000)}s.`,
        504,
        'RESELLER_TIMEOUT'
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function selectProvider(
  input: ResellerSelectInput
): Promise<ResellerSelectResult> {
  // Live multi-cloud quotes can take many minutes; do not abort client-side.
  return postReseller<ResellerSelectResult>('/api/select', input, 'select', 0);
}

export interface ResellerPricingRow {
  provider: string;
  region: string;
  category: string;
  canonicalSpec: string;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  rawIpPricePerHr?: number;
  rawTotalPricePerHr: number;
  instanceType?: string;
  currency?: string;
  fetchedAt?: string;
}

export async function listPricing(params: {
  providers?: string;
  provider?: string;
  category?: string;
  canonicalSpec?: string;
  limit?: number;
  nestedVirtualization?: boolean;
}): Promise<{ rows: ResellerPricingRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.providers) qs.set('providers', params.providers);
  if (params.provider) qs.set('provider', params.provider);
  if (params.category) qs.set('category', params.category);
  if (params.canonicalSpec) qs.set('canonicalSpec', params.canonicalSpec);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.nestedVirtualization != null) {
    qs.set('nestedVirtualization', params.nestedVirtualization ? 'true' : 'false');
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return getReseller<{ rows: ResellerPricingRow[]; total: number }>(
    `/api/pricing${suffix}`,
    'pricing'
  );
}

export async function provisionVm(
  input: ResellerProvisionInput
): Promise<ResellerProvisionResult> {
  return postReseller<ResellerProvisionResult>('/api/provision', input, 'provision', 600_000);
}

export async function terminateVm(
  input: ResellerTerminateInput
): Promise<{ terminated: boolean }> {
  return postReseller<{ terminated: boolean }>('/api/terminate', input, 'terminate', 300_000);
}
