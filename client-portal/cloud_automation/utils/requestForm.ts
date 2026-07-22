import type { CatalogInstance, CatalogService, ServiceCatalogResponse } from '../types/catalog';

export type PauseCleanupServiceKey = 'vm' | 'sql' | 'aks' | 'app_service' | 'cosmos';

const PAUSE_CLEANUP_SERVICE_MATCHERS: { key: PauseCleanupServiceKey; pattern: RegExp }[] = [
  { key: 'vm', pattern: /virtual machine|\bvm\b/i },
  { key: 'sql', pattern: /sql database|azure sql/i },
  { key: 'aks', pattern: /kubernetes service|\baks\b/i },
  { key: 'app_service', pattern: /app service/i },
  { key: 'cosmos', pattern: /cosmos/i },
];

export const PAUSE_CLEANUP_ACTION_LABELS: Record<PauseCleanupServiceKey, string> = {
  vm: 'Virtual Machines — deallocate (not delete)',
  sql: 'Azure SQL — pause serverless databases',
  aks: 'AKS — stop node pools / scale to 0',
  app_service: 'App Service — stop web apps',
  cosmos: 'Cosmos DB — kept (no Azure pause action)',
};

export const DELETE_CLEANUP_ACTION_LABELS: Record<PauseCleanupServiceKey, string> = {
  vm: 'Virtual Machines — permanently deleted',
  sql: 'Azure SQL — databases and servers deleted',
  aks: 'AKS — clusters and node pools deleted',
  app_service: 'App Service — web apps deleted',
  cosmos: 'Cosmos DB — accounts deleted',
};

export function getServicePauseCleanupKey(
  service: Pick<CatalogService, 'name' | 'service_name'>
): PauseCleanupServiceKey | null {
  const label = `${service.service_name || ''} ${service.name || ''}`;

  for (const { key, pattern } of PAUSE_CLEANUP_SERVICE_MATCHERS) {
    if (pattern.test(label)) {
      return key;
    }
  }

  return null;
}

export function getSelectedPauseCleanupServices(
  catalog: ServiceCatalogResponse,
  selectedServiceIds: number[]
): PauseCleanupServiceKey[] {
  const keys = new Set<PauseCleanupServiceKey>();

  for (const serviceId of selectedServiceIds) {
    const service = catalog.services.find(
      (entry) => normalizeServiceId(entry.id) === normalizeServiceId(serviceId)
    );
    if (!service) continue;

    const key = getServicePauseCleanupKey(service);
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

export function supportsPauseCleanup(
  catalog: ServiceCatalogResponse,
  selectedServiceIds: number[]
): boolean {
  return getSelectedPauseCleanupServices(catalog, selectedServiceIds).length > 0;
}

export function buildInstanceSelectionsParam(
  instances: { serviceId: number; instanceOption: string }[]
): string | undefined {
  if (instances.length === 0) return undefined;
  return instances.map((entry) => `${entry.serviceId}:${entry.instanceOption}`).join(',');
}

export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultStartDate(): string {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

export function defaultEndDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

export function defaultTestIdsStartDate(): string {
  return toDateTimeLocalValue(new Date());
}

export function defaultTestIdsEndDate(): string {
  const date = new Date();
  date.setHours(date.getHours() + 24);
  return toDateTimeLocalValue(date);
}

export const TEST_IDS_DEFAULTS = {
  accountCount: 5,
  perUserBudgetUsd: 10,
  resourceCleanupIntervalHours: 24,
} as const;

export function createDefaultUsageSchedule() {
  const days: Record<string, { enabled: boolean; limitMinutes: number; slots: { start: string; end: string }[] }> =
    {};

  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    const isWeekday = !['saturday', 'sunday'].includes(day);
    days[day] = isWeekday
      ? { enabled: true, limitMinutes: 120, slots: [{ start: '09:00', end: '17:00' }] }
      : { enabled: false, limitMinutes: 0, slots: [] };
  }

  return { timezone: 'Asia/Kolkata', days };
}

export function getMaxDailyLimitMinutes(schedule: {
  days: Record<string, { enabled?: boolean; limitMinutes?: number }>;
}): number {
  let max = 0;
  for (const config of Object.values(schedule.days)) {
    if (config?.enabled) {
      max = Math.max(max, Number(config.limitMinutes || 0));
    }
  }
  return max;
}

export function copyMondayScheduleToWeekdays(
  schedule: {
    timezone: string;
    days: Record<string, { enabled: boolean; limitMinutes: number; slots: { start: string; end: string }[] }>;
  }
) {
  const monday = schedule.days.monday;
  if (!monday) return schedule;

  const weekdays = ['tuesday', 'wednesday', 'thursday', 'friday'] as const;
  const days = { ...schedule.days };

  for (const day of weekdays) {
    days[day] = {
      enabled: monday.enabled,
      limitMinutes: monday.limitMinutes,
      slots: monday.slots.map((slot) => ({ ...slot })),
    };
  }

  return { ...schedule, days };
}

export function isCustomerDetailsComplete(input: {
  customerEmail: string;
  accountCount: number;
  startDate: string;
  endDate: string;
}): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(input.customerEmail.trim())) return false;
  if (!Number.isInteger(input.accountCount) || input.accountCount <= 0) return false;
  if (!input.startDate || !input.endDate) return false;
  return new Date(input.endDate) >= new Date(input.startDate);
}

export function isProjectDetailsComplete(input: {
  projectName: string;
  accountCount: number;
  startDate: string;
  endDate: string;
  idMode: string | null | undefined;
}): boolean {
  if (!String(input.projectName || '').trim()) return false;
  if (!input.idMode) return false;
  if (!Number.isInteger(input.accountCount) || input.accountCount <= 0) return false;
  if (!input.startDate || !input.endDate) return false;
  return new Date(input.endDate) >= new Date(input.startDate);
}

export function normalizeServiceId(value: number | string | null | undefined): number {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export function catalogInstancesForServices(
  catalogInstances: CatalogInstance[],
  serviceIds: number[]
): CatalogInstance[] {
  const idSet = new Set(serviceIds.map(normalizeServiceId).filter(Boolean));
  return catalogInstances.filter((instance) => idSet.has(normalizeServiceId(instance.serviceId)));
}

export function formatInstanceGuide(
  guide?: string | { summary?: string; description?: string } | null
): string | undefined {
  if (!guide) return undefined;
  if (typeof guide === 'string') return guide;
  return guide.summary || guide.description;
}

export interface ParsedInstanceGuide {
  summary: string;
  description: string;
  tier?: string;
  specs: { label: string; value: string }[];
  portalTips: string[];
}

type GuideObject = {
  summary?: string;
  description?: string;
  tier?: string;
  portalTips?: string[];
  specs?: { label: string; value: string }[];
  vcpu?: string;
  ram?: string;
  storage?: string;
  performance?: string;
};

function buildSpecsFromGuide(guide: GuideObject): { label: string; value: string }[] {
  if (Array.isArray(guide.specs) && guide.specs.length > 0) {
    return guide.specs;
  }

  const specs: { label: string; value: string }[] = [];
  if (guide.vcpu) specs.push({ label: 'vCPU', value: guide.vcpu });
  if (guide.ram) specs.push({ label: 'RAM', value: guide.ram });
  if (guide.storage) specs.push({ label: 'Storage', value: guide.storage });
  if (guide.performance) specs.push({ label: 'Performance', value: guide.performance });
  return specs;
}

export function parseInstanceGuide(
  guide?: string | GuideObject | null,
  optionName?: string
): ParsedInstanceGuide {
  const fallbackSummary = optionName ? `Azure option: ${optionName}` : 'Azure option';

  if (!guide) {
    return {
      summary: fallbackSummary,
      description: 'Select this tier or size for the chosen service.',
      specs: [],
      portalTips: [],
    };
  }

  if (typeof guide === 'string') {
    return {
      summary: guide,
      description: '',
      specs: [],
      portalTips: [],
    };
  }

  return {
    summary: guide.summary || fallbackSummary,
    description: guide.description || '',
    tier: guide.tier,
    specs: buildSpecsFromGuide(guide),
    portalTips: Array.isArray(guide.portalTips) ? guide.portalTips : [],
  };
}

export function getInstancePortalTips(
  guide?: string | { portalTips?: string[] } | null
): string[] {
  if (!guide || typeof guide === 'string') return [];
  return Array.isArray(guide.portalTips) ? guide.portalTips : [];
}

export function isVmCatalogService(
  service: Pick<CatalogService, 'name' | 'service_name'>
): boolean {
  const name = String(service.service_name || service.name || '');
  return /virtual machine|\bvm\b/i.test(name);
}

export function formatLocationOptionLabel(entry: {
  display_location: string;
  arm_region_name: string;
  basePrice?: number | null;
}): string {
  const priceSuffix =
    entry.basePrice != null ? ` — from $${Number(entry.basePrice).toFixed(3)}/hr` : '';
  return `${entry.display_location} (${entry.arm_region_name})${priceSuffix}`;
}

/** Prefer the lowest basePrice region; fall back to the first listed location. */
export function pickCheapestLocation(
  locations: Array<{ arm_region_name: string; basePrice?: number | null }>
): string {
  if (!locations.length) return '';

  const priced = locations
    .map((entry) => ({
      arm_region_name: entry.arm_region_name,
      basePrice:
        entry.basePrice != null && Number.isFinite(Number(entry.basePrice))
          ? Number(entry.basePrice)
          : null,
    }))
    .filter((entry) => entry.basePrice != null) as Array<{
    arm_region_name: string;
    basePrice: number;
  }>;

  if (priced.length > 0) {
    priced.sort((a, b) => a.basePrice - b.basePrice);
    return priced[0].arm_region_name;
  }

  return locations[0].arm_region_name;
}
