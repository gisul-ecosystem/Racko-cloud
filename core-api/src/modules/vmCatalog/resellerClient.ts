import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface ResellerSelectInput {
  canonicalSpec?: string;
  category: string;
  durationDays: number;
  specs?: { cpu?: string; ram?: string; disk?: string };
  /** Limit cheapest-provider search to these clouds. Omit for all. */
  providers?: string[] | string;
  /** Backward-compatible alias for providers. */
  provider?: string[] | string;
}

export interface ResellerSelectResult {
  provider: 'webyne' | 'aws' | 'azure' | 'gcp' | 'oci';
  region: string | null;
  category: string;
  canonicalSpec: string;
  rawTotalPricePerHr: number | null;
  rawComputePricePerHr?: number;
  rawStoragePricePerHr?: number;
  rawIpPricePerHr?: number;
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
  timeoutMs = 300_000
): Promise<T> {
  const url = `${resellerBaseUrl()}${path}`;
  logger.info(`[Reseller] ${logLabel}`, { url });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-Secret': config.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify(body),
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
  } finally {
    clearTimeout(timer);
  }
}

export async function selectProvider(
  input: ResellerSelectInput
): Promise<ResellerSelectResult> {
  return postReseller<ResellerSelectResult>('/api/select', input, 'select', 30_000);
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
