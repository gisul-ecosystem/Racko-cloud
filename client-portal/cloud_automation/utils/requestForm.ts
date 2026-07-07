import type { CatalogInstance } from '../types/catalog';

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
