import mongoose from 'mongoose';
import { VmAutomation } from './vmAutomation.model';
import { calendarDateInTimezone, isDateInRange } from './timezoneUtils';
import { AutomationPowerRestrictedError } from '../../utils/errors';

export interface AutomationScheduleSummary {
  name: string;
  startTime: string;
  stopTime: string;
  timezone: string;
}

export interface AutomationPowerInfo {
  automationManaged: boolean;
  automationSchedule?: AutomationScheduleSummary;
}

function scheduleFromAutomation(a: {
  name: string;
  startTime: string;
  stopTime: string;
  timezone: string;
}): AutomationScheduleSummary {
  return {
    name: a.name,
    startTime: a.startTime,
    stopTime: a.stopTime,
    timezone: a.timezone,
  };
}

/** Whether this VM is under an active automation within its date range right now. */
export async function getAutomationPowerInfo(
  vmId: mongoose.Types.ObjectId
): Promise<AutomationPowerInfo> {
  const map = await getAutomationPowerInfoBatch([vmId]);
  return map.get(vmId.toString()) ?? { automationManaged: false };
}

export async function getAutomationPowerInfoBatch(
  vmIds: mongoose.Types.ObjectId[]
): Promise<Map<string, AutomationPowerInfo>> {
  const result = new Map<string, AutomationPowerInfo>();
  for (const id of vmIds) {
    result.set(id.toString(), { automationManaged: false });
  }
  if (vmIds.length === 0) return result;

  const automations = await VmAutomation.find({
    isActive: true,
    vmIds: { $in: vmIds },
  }).lean();

  const now = new Date();
  for (const automation of automations) {
    const today = calendarDateInTimezone(now, automation.timezone);
    if (!isDateInRange(today, automation.startDate, automation.endDate, automation.timezone)) {
      continue;
    }
    for (const vid of automation.vmIds) {
      const key = vid.toString();
      if (result.has(key)) {
        result.set(key, {
          automationManaged: true,
          automationSchedule: scheduleFromAutomation(automation),
        });
      }
    }
  }

  return result;
}

/** Users cannot manually start/stop/restart VMs on an active automation schedule. */
export async function assertUserCanPowerVm(
  vmId: mongoose.Types.ObjectId,
  role: string
): Promise<void> {
  if (role === 'admin' || role === 'super_admin') return;

  const info = await getAutomationPowerInfo(vmId);
  if (info.automationManaged) {
    throw new AutomationPowerRestrictedError();
  }
}
