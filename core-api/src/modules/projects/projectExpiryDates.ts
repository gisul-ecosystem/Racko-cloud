/** UTC calendar day start (00:00:00.000Z). */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const d = startOfUtcDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

/** True when project's endDate calendar day is strictly before today (UTC). */
export function isProjectEndDatePast(endDate: Date, now = new Date()): boolean {
  return startOfUtcDay(endDate).getTime() < startOfUtcDay(now).getTime();
}

/** True when endDate falls on the warning target day (e.g. tomorrow when warningDays=1). */
export function isProjectEndDateOnWarningDay(
  endDate: Date,
  warningDays: number,
  now = new Date()
): boolean {
  const target = addUtcDays(startOfUtcDay(now), warningDays);
  return isSameUtcDay(endDate, target);
}

export function formatProjectDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
