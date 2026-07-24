import { UnprocessableEntityError } from '../../utils/errors';
import {
  validateWeeklySchedule,
  type WeeklyScheduleDay,
} from './weeklySchedule';
import type { AccessScheduleFields } from './scheduleManager';

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface AccessScheduleInput {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  weeklySchedule?: WeeklyScheduleDay[] | unknown[] | null;
  timezone?: string | null;
}

function parseDateOnly(value: string | null | undefined, field: string, errors: string[]): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${field} must be YYYY-MM-DD`);
    return undefined;
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function parseTime(value: string | null | undefined, field: string, errors: string[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!HHMM_RE.test(value)) {
    errors.push(`${field} must be HH:MM (24h)`);
    return undefined;
  }
  return value;
}

/**
 * Normalize API accessSchedule / PATCH body into Mongo fields.
 * Throws UnprocessableEntityError (422) on invalid weekly / time contract.
 */
export function parseAccessScheduleInput(
  input: AccessScheduleInput | undefined | null
): Partial<AccessScheduleFields> {
  if (!input || typeof input !== 'object') return {};

  const errors: string[] = [];
  const patch: Partial<AccessScheduleFields> = {};

  const startDate = parseDateOnly(input.startDate, 'startDate', errors);
  if (startDate !== undefined) patch.accessStartDate = startDate;

  const endDate = parseDateOnly(input.endDate, 'endDate', errors);
  if (endDate !== undefined) patch.accessEndDate = endDate;

  const startTime = parseTime(input.startTime, 'startTime', errors);
  if (startTime !== undefined) patch.accessStartTime = startTime;

  const endTime = parseTime(input.endTime, 'endTime', errors);
  if (endTime !== undefined) patch.accessEndTime = endTime;

  if (input.timezone !== undefined) {
    if (input.timezone === null || input.timezone === '') {
      patch.weeklyScheduleTz = 'Asia/Kolkata';
    } else if (typeof input.timezone === 'string') {
      patch.weeklyScheduleTz = input.timezone.trim() || 'Asia/Kolkata';
    } else {
      errors.push('timezone must be a string IANA name');
    }
  }

  if (input.weeklySchedule !== undefined) {
    if (input.weeklySchedule === null) {
      patch.weeklySchedule = null;
    } else if (Array.isArray(input.weeklySchedule) && input.weeklySchedule.length === 0) {
      // Empty array clears weekly mode
      patch.weeklySchedule = null;
    } else {
      const weeklyErrors = validateWeeklySchedule(input.weeklySchedule);
      errors.push(...weeklyErrors);
      if (weeklyErrors.length === 0) {
        patch.weeklySchedule = input.weeklySchedule as WeeklyScheduleDay[];
      }
    }
  }

  if (
    patch.accessStartDate &&
    patch.accessEndDate &&
    patch.accessStartDate > patch.accessEndDate
  ) {
    errors.push('startDate must be on or before endDate');
  }

  if (errors.length > 0) {
    throw new UnprocessableEntityError(errors);
  }

  return patch;
}

export function accessSchedulePublicView(vm: AccessScheduleFields) {
  return {
    accessStartDate: vm.accessStartDate ?? null,
    accessEndDate: vm.accessEndDate ?? null,
    accessStartTime: vm.accessStartTime ?? null,
    accessEndTime: vm.accessEndTime ?? null,
    accessOverride: Boolean(vm.accessOverride),
    accessOverrideUntil: vm.accessOverrideUntil ?? null,
    weeklySchedule: vm.weeklySchedule ?? null,
    weeklyScheduleTz: vm.weeklyScheduleTz || 'Asia/Kolkata',
  };
}
