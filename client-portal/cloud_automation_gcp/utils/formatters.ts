import { GCP_REGIONS } from '../constants';
import type { GcpRequest } from '../api/client';

export type GcpRequestStatusCategory = 'completed' | 'provisioning' | 'expired' | 'failed' | 'other';

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

export function formatCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—';
  const normalized = String(currency || 'USD').trim().toUpperCase() || 'USD';
  const locale = normalized === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalized,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDateTime(value);
}

export function truncateEmail(email: string, maxLength = 28): string {
  if (!email || email === '—') return email;
  if (email.length <= maxLength) return email;
  return `${email.slice(0, maxLength)}…`;
}

export function formatGcpRegion(region: string | null | undefined): string {
  if (!region) return '—';
  const normalized = String(region).trim();
  const match = GCP_REGIONS.find((entry) => entry.code === normalized);
  if (match) return match.name;
  return normalized
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getEstimatedPrice(request: GcpRequest): number | null {
  const raw = request.estimated_price ?? request.estimatedPrice;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

export function getRequestStatus(request: GcpRequest): string {
  return request.status ?? 'Unknown';
}

export function getCustomerEmail(request: GcpRequest): string {
  return request.customer_email ?? request.customerEmail ?? '—';
}

export function getAccountCount(request: GcpRequest): number {
  const raw = request.account_count ?? request.accountCount;
  return typeof raw === 'number' ? raw : 0;
}

export function getCreatedAt(request: GcpRequest): string | null {
  return request.createdAt ?? null;
}

export function getProjectName(request: GcpRequest): string {
  return request.project_name ?? request.projectName ?? 'Lab request';
}

export function getRackoProjectId(request: GcpRequest): string | null {
  const raw = (request as GcpRequest & { project_id?: string; projectId?: string }).project_id
    ?? (request as GcpRequest & { projectId?: string }).projectId;
  if (!raw) return null;
  const id = String(raw).trim();
  return id || null;
}

export function categorizeGcpRequestStatus(status: string): GcpRequestStatusCategory {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  if (normalized === 'expired' || normalized === 'cancelled') return 'expired';
  if (['pending', 'provisioning', 'processing', 'active'].includes(normalized)) {
    return 'provisioning';
  }
  return 'other';
}
