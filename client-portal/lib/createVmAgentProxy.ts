import { NextResponse } from 'next/server';
import {
  applyWebyneOverridesToCart,
  applyWebyneOverridesToPricing,
  emptyWebyneOverridesState,
  type WebyneOverridesState,
} from './catalogPricingMerge';
import { getGatewayBaseUrl } from './gatewayUrl';

const DEFAULT_AGENT_URL = 'http://127.0.0.1:3789';
const ALLOWED_TYPES = new Set(['linux', 'windows', 'gpu']);

export function getCreateVmAgentBaseUrl(): string {
  const raw =
    process.env.CREATE_VM_AGENT_URL ||
    process.env.WEBYNE_AGENT_URL ||
    DEFAULT_AGENT_URL;
  return raw.replace(/\/$/, '');
}

export function isAllowedCatalogType(type: string): boolean {
  return ALLOWED_TYPES.has(String(type || '').toLowerCase());
}

export function sanitizeProviderText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/https?:\/\/cloud\.webyne\.com[^\s"'`]*/gi, 'the provider portal')
    .replace(/webyne/gi, 'provider');
}

export function sanitizeCatalogError(value: unknown): string {
  const raw = String(value ?? '');
  if (/ECONNREFUSED|fetch failed|Catalog service is unavailable/i.test(raw)) {
    return 'Catalog service is unavailable. Check CREATE_VM_AGENT_URL and that the agent is running.';
  }
  if (/ERR_ABORTED|net::ERR_/i.test(raw)) {
    return 'Catalog fetch was interrupted while loading the provider portal. Keep the catalog agent running and click Refresh.';
  }
  if (/Timeout|timed out|TimeoutError/i.test(raw)) {
    return 'Catalog fetch timed out. The provider portal or agent may be slow — retry in a moment.';
  }
  if (/login|password|Sign in|authenticated/i.test(raw)) {
    return 'Catalog agent could not sign in to the provider portal. Check agent credentials on the VM.';
  }
  if (!raw.trim()) {
    return 'Catalog request failed.';
  }
  return sanitizeProviderText(raw);
}

function sanitizeDeep(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeProviderText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'source') continue;
      if (k === 'raw') continue;
      out[k] = sanitizeDeep(v);
    }
    return out;
  }
  return value;
}

/** Load sell-price overrides from core-api (Mongo) using the caller's access token. */
export async function fetchWebyneOverridesFromDb(
  authorizationHeader: string | null
): Promise<WebyneOverridesState> {
  if (!authorizationHeader) {
    return emptyWebyneOverridesState();
  }

  const base = getGatewayBaseUrl();
  const res = await fetch(`${base}/api/v1/external-vm-pricing/webyne`, {
    headers: {
      Authorization: authorizationHeader,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    // Fail closed to scraped pricing rather than break Create VM.
    return emptyWebyneOverridesState();
  }

  const envelope = (await res.json()) as {
    data?: WebyneOverridesState;
  };
  const data = envelope.data;
  if (!data?.categories) return emptyWebyneOverridesState();
  return {
    provider: 'webyne',
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
    categories: {
      linux: data.categories.linux ?? { multiplier: 1, plans: {} },
      windows: data.categories.windows ?? { multiplier: 1, plans: {} },
      gpu: data.categories.gpu ?? { multiplier: 1, plans: {} },
    },
  };
}

async function applySavedOverrides(
  agentPath: string,
  data: unknown,
  authorizationHeader: string | null
): Promise<unknown> {
  if (!data || typeof data !== 'object') return data;
  const state = await fetchWebyneOverridesFromDb(authorizationHeader);
  const payload = data as Record<string, unknown>;

  if (agentPath.includes('/api/pricing/')) {
    return applyWebyneOverridesToPricing(payload, state);
  }
  if (agentPath.includes('/api/cart/')) {
    return applyWebyneOverridesToCart(payload, state);
  }
  return data;
}

export async function proxyCreateVmAgent(
  path: string,
  searchParams?: URLSearchParams,
  options?: { applyOverrides?: boolean; authorizationHeader?: string | null }
): Promise<NextResponse> {
  const applyOverrides = options?.applyOverrides !== false;
  const base = getCreateVmAgentBaseUrl();
  const qs = searchParams?.toString();
  const url = `${base}${path}${qs ? `?${qs}` : ''}`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return NextResponse.json(
        {
          error: sanitizeCatalogError(
            text || `Catalog service returned HTTP ${res.status}`
          ),
        },
        { status: res.status || 502 }
      );
    }

    const data = await res.json();
    if (!res.ok) {
      const message =
        typeof data?.error === 'string'
          ? sanitizeCatalogError(data.error)
          : `Catalog request failed (HTTP ${res.status})`;
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const merged = applyOverrides
      ? await applySavedOverrides(path, data, options?.authorizationHeader ?? null)
      : data;
    return NextResponse.json(sanitizeDeep(merged));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to reach catalog service';
    const isConn =
      /ECONNREFUSED|fetch failed|AbortError|timed out|TimeoutError/i.test(
        message
      );
    return NextResponse.json(
      {
        error: isConn
          ? 'Catalog service is unavailable. Check CREATE_VM_AGENT_URL and that the agent is running.'
          : sanitizeCatalogError(message),
      },
      { status: isConn ? 503 : 502 }
    );
  }
}
