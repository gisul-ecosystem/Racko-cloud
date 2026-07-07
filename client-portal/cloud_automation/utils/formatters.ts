import type { ProvisioningRequest, RequestStatusCategory } from '../types';

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

/** Minimum catalog retail price for a service (lowest across regions). */
export function formatCatalogServicePrice(service: {
  retail_price?: number;
  price?: number;
  currency?: string;
}): string | null {
  const raw = service.price ?? service.retail_price;
  if (raw == null || Number.isNaN(Number(raw)) || Number(raw) <= 0) return null;

  const currency = service.currency ?? 'USD';
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(raw));

  return `from ${formatted}/hr`;
}

export function getEstimatedPrice(request: ProvisioningRequest): number | null {
  const raw = request.estimated_price ?? request.estimatedPrice;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

export function getRequestStatus(request: ProvisioningRequest): string {
  return request.status ?? 'Unknown';
}

export function categorizeRequestStatus(status: string): RequestStatusCategory {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'completed') return 'completed';
  if (normalized === 'expired' || normalized === 'cancelled') return 'expired';
  if (
    normalized === 'pending' ||
    normalized === 'provisioning' ||
    normalized === 'processing' ||
    normalized === 'active'
  ) {
    return 'provisioning';
  }

  return 'other';
}

export function getCustomerEmail(request: ProvisioningRequest): string {
  return request.customer_email ?? request.customerEmail ?? '—';
}

export function getAccountCount(request: ProvisioningRequest): number {
  const raw = request.account_count ?? request.accountCount;
  return typeof raw === 'number' ? raw : 0;
}

export function getCreatedAt(request: ProvisioningRequest): string | null {
  return request.created_at ?? request.createdAt ?? null;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

/** Estimated catalog price allocated to a single user. */
export function computePerUserEstimatedCost(
  estimatedPrice: number | string | null | undefined,
  userCount: number
): number | null {
  if (userCount <= 0) return null;
  if (estimatedPrice == null) return null;
  const total = Number(estimatedPrice);
  if (Number.isNaN(total) || total <= 0) return null;
  return total / userCount;
}
