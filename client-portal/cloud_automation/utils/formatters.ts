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

const REGION_DIRECTION_SUFFIXES = ['north', 'south', 'east', 'west', 'central'] as const;

const KNOWN_AZURE_REGIONS: Record<string, string> = {
  australiaeast: 'Australia East',
  australiasoutheast: 'Australia Southeast',
  brazilsouth: 'Brazil South',
  canadacentral: 'Canada Central',
  canadaeast: 'Canada East',
  centralindia: 'Central India',
  centralus: 'Central US',
  denmarkeast: 'Denmark East',
  eastasia: 'East Asia',
  eastus: 'East US',
  eastus2: 'East US 2',
  francecentral: 'France Central',
  germanywestcentral: 'Germany West Central',
  japaneast: 'Japan East',
  japanwest: 'Japan West',
  koreacentral: 'Korea Central',
  northcentralus: 'North Central US',
  northeurope: 'North Europe',
  norwayeast: 'Norway East',
  southafricanorth: 'South Africa North',
  southcentralus: 'South Central US',
  southeastasia: 'Southeast Asia',
  southindia: 'South India',
  swedencentral: 'Sweden Central',
  switzerlandnorth: 'Switzerland North',
  uaenorth: 'UAE North',
  uksouth: 'UK South',
  ukwest: 'UK West',
  westcentralus: 'West Central US',
  westeurope: 'West Europe',
  westindia: 'West India',
  westus: 'West US',
  westus2: 'West US 2',
  westus3: 'West US 3',
};

function titleCaseWord(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Turn an Azure ARM region slug into a readable label (e.g. southafricanorth → South Africa North). */
export function formatAzureRegion(region: string | null | undefined): string {
  if (!region) return '—';

  const normalized = String(region).trim().toLowerCase();
  if (!normalized) return '—';

  if (KNOWN_AZURE_REGIONS[normalized]) {
    return KNOWN_AZURE_REGIONS[normalized];
  }

  for (const direction of REGION_DIRECTION_SUFFIXES) {
    if (!normalized.endsWith(direction) || normalized.length <= direction.length) {
      continue;
    }

    const base = normalized.slice(0, -direction.length);
    if (!base) {
      return titleCaseWord(direction);
    }

    return `${titleCaseWord(base)} ${titleCaseWord(direction)}`;
  }

  return normalized
    .replace(/(\d+)/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
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
