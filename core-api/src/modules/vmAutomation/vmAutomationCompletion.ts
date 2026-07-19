import type mongoose from 'mongoose';
import type { IVmAutomation } from './vmAutomation.model';

export type VmAutomationAction = 'resume' | 'hibernate';

function readVmCompletionDate(
  automation: IVmAutomation,
  action: VmAutomationAction,
  vmId: string
): string | undefined {
  const field = action === 'resume' ? 'lastResumeOnByVm' : 'lastHibernateOnByVm';
  const raw = automation[field];
  if (!raw) return undefined;
  if (raw instanceof Map) return raw.get(vmId);
  return (raw as Record<string, string>)[vmId];
}

export function vmNeedsAutomationAction(
  automation: IVmAutomation,
  action: VmAutomationAction,
  vmId: mongoose.Types.ObjectId,
  today: string
): boolean {
  return readVmCompletionDate(automation, action, vmId.toString()) !== today;
}

export function pendingAutomationVmIds(
  automation: IVmAutomation,
  action: VmAutomationAction,
  today: string
): mongoose.Types.ObjectId[] {
  return automation.vmIds.filter((vmId) => vmNeedsAutomationAction(automation, action, vmId, today));
}

/** Resume retries from startTime until stopTime; hibernate retries from stopTime onward. */
export function isAutomationActionDue(
  automation: IVmAutomation,
  action: VmAutomationAction,
  clock: string,
  today: string
): boolean {
  const pending = pendingAutomationVmIds(automation, action, today);
  if (pending.length === 0) return false;

  if (action === 'resume') {
    return clock >= automation.startTime && clock < automation.stopTime;
  }

  return clock >= automation.stopTime;
}

export function allVmsCompletedForDay(
  automation: IVmAutomation,
  action: VmAutomationAction,
  today: string
): boolean {
  return automation.vmIds.every(
    (vmId) => readVmCompletionDate(automation, action, vmId.toString()) === today
  );
}

export function vmActionCompletionField(
  action: VmAutomationAction
): 'lastResumeOnByVm' | 'lastHibernateOnByVm' {
  return action === 'resume' ? 'lastResumeOnByVm' : 'lastHibernateOnByVm';
}

export function aggregateCompletionField(
  action: VmAutomationAction
): 'lastResumeOn' | 'lastHibernateOn' {
  return action === 'resume' ? 'lastResumeOn' : 'lastHibernateOn';
}
