import mongoose from 'mongoose';
import { VmAutomation, type IVmAutomation } from './vmAutomation.model';
import { VM } from '../vm/vm.model';
import { vmService } from '../vm/vm.service';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import {
  calendarDateInTimezone,
  clockTimeInTimezone,
  isDateInRange,
  parseDateOnlyUtc,
} from './timezoneUtils';

export interface CreateVmAutomationDto {
  name: string;
  vmIds: string[];
  startTime: string;
  stopTime: string;
  startDate: string;
  endDate: string;
  timezone: string;
}

export interface UpdateVmAutomationDto {
  name?: string;
  vmIds?: string[];
  startTime?: string;
  stopTime?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  isActive?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertVmsAccessible(
  vmIds: string[],
  adminId: string,
  role: string
): Promise<mongoose.Types.ObjectId[]> {
  const objectIds = vmIds.map((id) => new mongoose.Types.ObjectId(id));
  const filter: Record<string, unknown> = {
    _id: { $in: objectIds },
    status: { $nin: ['deleting', 'deleted'] },
  };
  if (role !== 'super_admin') {
    filter['adminId'] = new mongoose.Types.ObjectId(adminId);
  }

  const count = await VM.countDocuments(filter);

  if (count !== vmIds.length) {
    throw new ValidationError('One or more VMs are invalid or not accessible.');
  }

  return objectIds;
}

function serializeAutomation(doc: IVmAutomation) {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    adminId: doc.adminId.toString(),
    vmIds: doc.vmIds.map((id) => id.toString()),
    vmCount: doc.vmIds.length,
    startTime: doc.startTime,
    stopTime: doc.stopTime,
    startDate: doc.startDate.toISOString().slice(0, 10),
    endDate: doc.endDate.toISOString().slice(0, 10),
    timezone: doc.timezone,
    isActive: doc.isActive,
    lastResumeOn: doc.lastResumeOn,
    lastHibernateOn: doc.lastHibernateOn,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class VmAutomationService {
  async list(adminId: string) {
    const docs = await VmAutomation.find({ adminId: new mongoose.Types.ObjectId(adminId) })
      .sort({ createdAt: -1 })
      .lean<IVmAutomation[]>();
    return docs.map((d) => serializeAutomation(d as IVmAutomation));
  }

  async getById(automationId: string, adminId: string, role: string) {
    const doc = await VmAutomation.findById(automationId);
    if (!doc) throw new NotFoundError('Automation not found.');
    if (role !== 'super_admin' && doc.adminId.toString() !== adminId) {
      throw new ForbiddenError('You do not have permission to access this automation.');
    }
    return serializeAutomation(doc);
  }

  async create(adminId: string, role: string, dto: CreateVmAutomationDto) {
    const vmObjectIds = await assertVmsAccessible(dto.vmIds, adminId, role);

    const doc = await VmAutomation.create({
      name: dto.name,
      adminId: new mongoose.Types.ObjectId(adminId),
      vmIds: vmObjectIds,
      startTime: dto.startTime,
      stopTime: dto.stopTime,
      startDate: parseDateOnlyUtc(dto.startDate),
      endDate: parseDateOnlyUtc(dto.endDate),
      timezone: dto.timezone || 'UTC',
      isActive: true,
    });

    logger.info('[Automation] Created', {
      automationId: doc._id.toString(),
      adminId,
      vmCount: vmObjectIds.length,
    });

    return serializeAutomation(doc);
  }

  async update(automationId: string, adminId: string, role: string, dto: UpdateVmAutomationDto) {
    const doc = await VmAutomation.findById(automationId);
    if (!doc) throw new NotFoundError('Automation not found.');
    if (role !== 'super_admin' && doc.adminId.toString() !== adminId) {
      throw new ForbiddenError('You do not have permission to modify this automation.');
    }

    if (dto.name !== undefined) doc.name = dto.name;
    if (dto.startTime !== undefined) doc.startTime = dto.startTime;
    if (dto.stopTime !== undefined) doc.stopTime = dto.stopTime;
    if (dto.startDate !== undefined) doc.startDate = parseDateOnlyUtc(dto.startDate);
    if (dto.endDate !== undefined) doc.endDate = parseDateOnlyUtc(dto.endDate);
    if (dto.timezone !== undefined) doc.timezone = dto.timezone;
    if (dto.isActive !== undefined) doc.isActive = dto.isActive;

    if (dto.vmIds !== undefined) {
      doc.vmIds = await assertVmsAccessible(dto.vmIds, doc.adminId.toString(), role);
    }

    if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) {
      throw new ValidationError('endDate must be on or after startDate.');
    }

    await doc.save();
    return serializeAutomation(doc);
  }

  async delete(automationId: string, adminId: string, role: string) {
    const doc = await VmAutomation.findById(automationId);
    if (!doc) throw new NotFoundError('Automation not found.');
    if (role !== 'super_admin' && doc.adminId.toString() !== adminId) {
      throw new ForbiddenError('You do not have permission to delete this automation.');
    }
    await doc.deleteOne();
  }

  /** Run due resume/hibernate actions — called every scheduler tick. */
  async runDueAutomations(now = new Date()): Promise<void> {
    const automations = await VmAutomation.find({ isActive: true }).lean<IVmAutomation[]>();

    for (const automation of automations) {
      const today = calendarDateInTimezone(now, automation.timezone);
      if (!isDateInRange(today, automation.startDate, automation.endDate, automation.timezone)) {
        continue;
      }

      const clock = clockTimeInTimezone(now, automation.timezone);

      if (clock === automation.startTime && automation.lastResumeOn !== today) {
        await this.executeForAutomation(automation, 'resume', today);
      } else if (clock === automation.stopTime && automation.lastHibernateOn !== today) {
        await this.executeForAutomation(automation, 'hibernate', today);
      }
    }
  }

  private async executeForAutomation(
    automation: IVmAutomation,
    action: 'resume' | 'hibernate',
    today: string
  ): Promise<void> {
    const automationId = automation._id.toString();
    const adminId = automation.adminId;

    logger.info('[Automation] Executing batch', {
      automationId,
      action,
      vmCount: automation.vmIds.length,
      today,
    });

    const staggerMs = config.VM_AUTOMATION_STAGGER_MS;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < automation.vmIds.length; i++) {
      const vmId = automation.vmIds[i];
      try {
        if (action === 'resume') {
          await vmService.resumeVmAutomation(vmId, adminId);
        } else {
          await vmService.hibernateVmAutomation(vmId, adminId);
        }
        successCount++;
      } catch (err) {
        failCount++;
        logger.error('[Automation] VM action failed', {
          automationId,
          action,
          vmId: vmId.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (i < automation.vmIds.length - 1 && staggerMs > 0) {
        await sleep(staggerMs);
      }
    }

    const updateField = action === 'resume' ? 'lastResumeOn' : 'lastHibernateOn';
    await VmAutomation.updateOne({ _id: automation._id }, { $set: { [updateField]: today } });

    logger.info('[Automation] Batch complete', {
      automationId,
      action,
      successCount,
      failCount,
    });
  }
}

export const vmAutomationService = new VmAutomationService();
