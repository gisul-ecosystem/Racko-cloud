/** Calendar date YYYY-MM-DD in an IANA timezone. */
export function calendarDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Clock time HH:mm (24h) in an IANA timezone. */
export function clockTimeInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD to UTC midnight for range comparisons. */
export function parseDateOnlyUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function isDateInRange(todayStr: string, startDate: Date, endDate: Date, timezone: string): boolean {
  const startStr = calendarDateInTimezone(startDate, timezone);
  const endStr = calendarDateInTimezone(endDate, timezone);
  return todayStr >= startStr && todayStr <= endStr;
}
