import mongoose from 'mongoose';
import { VmAutomation, type IVmAutomation } from './vmAutomation.model';
import { VM } from '../vm/vm.model';
import { ValidationError } from '../../utils/errors';

export interface AutomationSchedule {
  startTime: string;
  stopTime: string;
  startDate: string;
  endDate: string;
  timezone: string;
  vmIds: string[];
  isActive: boolean;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function assertResumeWindowValid(startTime: string, stopTime: string): void {
  if (timeToMinutes(startTime) >= timeToMinutes(stopTime)) {
    throw new ValidationError('startTime must be before stopTime.');
  }
}

/** Inclusive calendar date ranges (YYYY-MM-DD). */
export function dateRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA;
}

/**
 * Daily resume windows [start, stop). Touching boundaries are allowed (e.g. 16:00–18:00 and 18:00–20:00).
 */
export function timeWindowsOverlap(
  startA: string,
  stopA: string,
  startB: string,
  stopB: string
): boolean {
  const s1 = timeToMinutes(startA);
  const e1 = timeToMinutes(stopA);
  const s2 = timeToMinutes(startB);
  const e2 = timeToMinutes(stopB);
  return s1 < e2 && s2 < e1;
}

export function sharedVmIds(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

export function schedulesConflict(a: AutomationSchedule, b: AutomationSchedule): boolean {
  if (!a.isActive || !b.isActive) return false;
  if (!dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) return false;
  if (!timeWindowsOverlap(a.startTime, a.stopTime, b.startTime, b.stopTime)) return false;
  return sharedVmIds(a.vmIds, b.vmIds).length > 0;
}

function scheduleFromDoc(doc: IVmAutomation): AutomationSchedule {
  return {
    startTime: doc.startTime,
    stopTime: doc.stopTime,
    startDate: doc.startDate.toISOString().slice(0, 10),
    endDate: doc.endDate.toISOString().slice(0, 10),
    timezone: doc.timezone,
    vmIds: doc.vmIds.map((id) => id.toString()),
    isActive: doc.isActive,
  };
}

export async function assertNoAutomationConflicts(
  adminId: mongoose.Types.ObjectId,
  candidate: AutomationSchedule,
  excludeAutomationId?: mongoose.Types.ObjectId
): Promise<void> {
  if (!candidate.isActive) return;

  assertResumeWindowValid(candidate.startTime, candidate.stopTime);

  const query: Record<string, unknown> = {
    adminId,
    isActive: true,
  };
  if (excludeAutomationId) {
    query['_id'] = { $ne: excludeAutomationId };
  }

  const existing = await VmAutomation.find(query).lean<IVmAutomation[]>();

  for (const other of existing) {
    const otherSchedule = scheduleFromDoc(other);
    if (!schedulesConflict(candidate, otherSchedule)) continue;

    const overlapVmIds = sharedVmIds(candidate.vmIds, otherSchedule.vmIds);
    const vmDocs = await VM.find({
      _id: { $in: overlapVmIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select('name')
      .lean();

    const vmLabel =
      vmDocs.map((vm) => vm.name).join(', ') || overlapVmIds.join(', ');

    throw new ValidationError(
      `Schedule conflicts with "${other.name}" (${otherSchedule.startTime}–${otherSchedule.stopTime}, ${otherSchedule.startDate} to ${otherSchedule.endDate}) for VM(s): ${vmLabel}.`
    );
  }
}
