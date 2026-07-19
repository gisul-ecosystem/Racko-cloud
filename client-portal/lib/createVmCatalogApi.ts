import { getAccessToken } from './apiClient';

export type CatalogType = 'linux' | 'windows' | 'gpu';

export interface CatalogPlan {
  planId: number | string | null;
  sno?: number | string | null;
  plan: string;
  cpu: string | null;
  ram: string | null;
  disk: string | null;
  hourly: string | null;
  monthly: string | null;
  quarterly: string | null;
  yearly: string | null;
}

export interface PricingResponse {
  category: CatalogType | string;
  fetchedAt: string;
  count: number;
  plans: CatalogPlan[];
}

export interface BillingCycle {
  value: string;
  amount: number | null;
}

export interface CartTemplate {
  value: string;
  label: string;
  selected?: boolean;
}

export interface CartPricing {
  currency: string;
  subtotal: number | null;
  taxLabel: string;
  tax: number | null;
  total: number | null;
}

export interface CartDetails {
  fetchedAt: string;
  category: string;
  planId: number;
  name: string;
  specs: {
    cpu: string;
    ram: string;
    disk: string;
    core?: number | string;
    processor?: string;
    ramGb?: number | string;
    ramType?: string;
    diskGb?: number | string;
    diskType?: string;
  };
  billingCycles: BillingCycle[];
  selectedBilling: string;
  quantity: number;
  pricing: CartPricing;
  templates: CartTemplate[];
  templatesError?: string | null;
}

export interface BuyPreview {
  mode: string;
  submitted: boolean;
  willSubmit: boolean;
  ready: boolean;
  validationErrors: string[];
  note?: string;
  fetchedAt?: string;
  category?: string;
  request?: {
    method: string;
    url: string;
    contentType?: string;
    fields: Record<string, string>;
  };
  template?: { value: string; label: string } | null;
  plan?: {
    id: number;
    name: string;
    specs: CartDetails['specs'];
  };
  pricing?: CartPricing;
  expectedOutcomes?: {
    successStatus?: number;
    insufficientBalanceStatus?: number;
    redirectUrl?: string;
  };
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (data as { error?: string })?.error === 'string'
        ? (data as { error: string }).error
        : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function getPricing(
  type: CatalogType,
  opts?: { raw?: boolean }
): Promise<PricingResponse> {
  const qs = new URLSearchParams({ t: String(Date.now()) });
  if (opts?.raw) qs.set('raw', '1');
  const res = await fetch(
    `/api/create-vm/pricing/${encodeURIComponent(type)}?${qs}`,
    {
      cache: 'no-store',
      headers: authHeaders(),
    }
  );
  return parseJson<PricingResponse>(res);
}

export async function getCart(
  type: CatalogType,
  planId: string | number,
  opts?: { billing?: string; quantity?: string | number }
): Promise<CartDetails> {
  const qs = new URLSearchParams();
  if (opts?.billing) qs.set('billing', opts.billing);
  if (opts?.quantity != null) qs.set('quantity', String(opts.quantity));
  qs.set('t', String(Date.now()));
  const res = await fetch(
    `/api/create-vm/cart/${encodeURIComponent(type)}/${encodeURIComponent(String(planId))}?${qs}`,
    {
      cache: 'no-store',
      headers: authHeaders(),
    }
  );
  return parseJson<CartDetails>(res);
}

export async function getBuyPreview(
  type: CatalogType,
  planId: string | number,
  opts: { billing: string; quantity: string | number; template: string }
): Promise<BuyPreview> {
  const qs = new URLSearchParams({
    billing: opts.billing,
    quantity: String(opts.quantity),
    template: opts.template,
    t: String(Date.now()),
  });
  const res = await fetch(
    `/api/create-vm/cart/${encodeURIComponent(type)}/${encodeURIComponent(String(planId))}/buy-preview?${qs}`,
    {
      cache: 'no-store',
      headers: authHeaders(),
    }
  );
  return parseJson<BuyPreview>(res);
}
