import type { Request } from 'express';
import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { VM, type IVM } from '../vm/vm.model';
import { vmService } from '../vm/vm.service';
import { logger } from '../../utils/logger';
import type { AuthenticatedRequest } from '../../types';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { tenantUserService } from '../tenantUser/tenantUser.service';
import type {
  TenantVmActor,
  TenantBulkAssignPairsResult,
  TenantOnboardDto,
  TenantVmAssignmentSummary,
  TenantVmDetails,
  TenantVmListFilters,
  TenantVmSummary,
  SuperAdminTenantVmSummary,
} from './tenantVm.types';

function buildPlatformVmRequest(req: Request, adminId: mongoose.Types.ObjectId): Request {
  return {
    ...req,
    headers: req.headers,
    ip: req.ip,
    user: {
      userId: adminId.toString(),
      role: 'admin',
      sessionId: 'tenant-proxy',
    },
  } as Request & AuthenticatedRequest;
}

function toAssignmentSummary(user?: {
  _id: mongoose.Types.ObjectId;
  email: string;
  isActive: boolean;
} | null): TenantVmAssignmentSummary | null {
  if (!user) return null;
  return {
    tenantUserId: user._id.toString(),
    email: user.email,
    isActive: user.isActive,
  };
}

export class TenantVmService {
  private async loadTenantVmForActor(actor: TenantVmActor, vmId: string): Promise<IVM> {
    const query: Record<string, unknown> = {
      _id: new mongoose.Types.ObjectId(vmId),
      tenantId: new mongoose.Types.ObjectId(actor.tenantId),
      status: { $nin: ['deleted', 'deleting', 'delete_failed'] },
    };

    if (actor.role === 'tenant_user') {
      query['assignedTenantUserId'] = new mongoose.Types.ObjectId(actor.id);
    }

    const vm = await VM.findOne(query);
    if (!vm) throw new NotFoundError('VM not found.');
    return vm;
  }

  private async loadAssignmentMap(vms: Array<Pick<IVM, 'assignedTenantUserId'>>): Promise<Map<string, TenantVmAssignmentSummary>> {
    const assignedIds = [...new Set(
      vms
        .map((vm) => vm.assignedTenantUserId?.toString())
        .filter((id): id is string => Boolean(id))
    )];

    if (assignedIds.length === 0) {
      return new Map();
    }

    const users = await TenantUser.find({ _id: { $in: assignedIds } })
      .select('_id email isActive')
      .lean();

    return new Map(users.map((user) => [user._id.toString(), toAssignmentSummary(user)!]));
  }

  private toTenantVmSummary(
    vm: IVM,
    assignmentMap: Map<string, TenantVmAssignmentSummary>,
    actor: TenantVmActor
  ): TenantVmSummary {
    const assignment = vm.assignedTenantUserId
      ? assignmentMap.get(vm.assignedTenantUserId.toString()) ?? null
      : null;

    return {
      id: vm._id.toString(),
      vmid: vm.vmid,
      node: vm.node,
      name: vm.name,
      description: actor.role === 'tenant_admin' ? vm.description : undefined,
      status: vm.status,
      proxmoxStatus: vm.proxmoxStatus,
      ipAddress: vm.ipAddress,
      cloneType: vm.cloneType,
      allocatedCpu: vm.allocatedCpu,
      allocatedMemoryGb: vm.allocatedMemoryGb,
      allocatedDiskGb: vm.allocatedDiskGb,
      consoleProtocol: vm.consoleProtocol,
      consoleReady: vm.consoleReady,
      planStatus: vm.planStatus ?? null,
      planPeriodEnd: vm.planPeriodEnd ?? null,
      billingPeriod: vm.billingPeriod ?? null,
      assignment: actor.role === 'tenant_admin' ? assignment : null,
      createdAt: vm.createdAt,
      updatedAt: vm.updatedAt,
    };
  }

  private assertPlanActiveForOperations(vm: IVM): void {
    if (vm.planStatus !== 'active') {
      throw new ValidationError('VM plan is not active. Renew the plan before performing this operation.');
    }
  }

  async listVms(actor: TenantVmActor, filters?: TenantVmListFilters): Promise<TenantVmSummary[]> {
    const query: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(actor.tenantId),
      status: { $nin: ['deleted', 'deleting', 'delete_failed'] },
    };

    if (actor.role === 'tenant_user') {
      query['assignedTenantUserId'] = new mongoose.Types.ObjectId(actor.id);
    }
    if (filters?.status) query['status'] = filters.status;
    if (filters?.node) query['node'] = filters.node;

    const vms = await VM.find(query).sort({ createdAt: -1 });
    const assignmentMap = await this.loadAssignmentMap(vms);
    return vms.map((vm) => this.toTenantVmSummary(vm, assignmentMap, actor));
  }

  /**
   * List all VMs provisioned for a tenant (super-admin white-labelling console).
   */
  async listVmsForSuperAdmin(
    tenantId: mongoose.Types.ObjectId,
    filters?: TenantVmListFilters
  ): Promise<SuperAdminTenantVmSummary[]> {
    const tenant = await Tenant.findById(tenantId).select('_id').lean();
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const actor: TenantVmActor = {
      id: 'super-admin',
      tenantId: tenantId.toString(),
      role: 'tenant_admin',
    };

    const query: Record<string, unknown> = {
      tenantId,
      status: { $nin: ['deleted', 'deleting', 'delete_failed'] },
    };

    if (filters?.status) query['status'] = filters.status;
    if (filters?.node) query['node'] = filters.node;

    const vms = await VM.find(query).sort({ createdAt: -1 });
    const assignmentMap = await this.loadAssignmentMap(vms);

    return vms.map((vm) => ({
      ...this.toTenantVmSummary(vm, assignmentMap, actor),
      templateName: vm.templateName,
      orderId: vm.orderId?.toString() ?? null,
    }));
  }

  async getVmDetails(actor: TenantVmActor, vmId: string, req: Request): Promise<TenantVmDetails> {
    let vm = await this.loadTenantVmForActor(actor, vmId);
    let liveStatus;

    try {
      liveStatus = await vmService.getVMStatus(vm._id, vm.adminId, buildPlatformVmRequest(req, vm.adminId));
    } catch {
      liveStatus = undefined;
    }

    const refreshedVm = await VM.findById(vm._id);
    if (refreshedVm) {
      vm = refreshedVm;
    }

    const assignmentMap = await this.loadAssignmentMap([vm]);
    return {
      vm: this.toTenantVmSummary(vm, assignmentMap, actor),
      liveStatus,
    };
  }

  async getVmStatus(actor: TenantVmActor, vmId: string, req: Request) {
    const vm = await this.loadTenantVmForActor(actor, vmId);
    return vmService.getVMStatus(vm._id, vm.adminId, buildPlatformVmRequest(req, vm.adminId));
  }

  async startVm(actor: TenantVmActor, vmId: string, req: Request) {
    const vm = await this.loadTenantVmForActor(actor, vmId);
    this.assertPlanActiveForOperations(vm);
    return vmService.startVM(vm._id, vm.adminId, buildPlatformVmRequest(req, vm.adminId));
  }

  async stopVm(actor: TenantVmActor, vmId: string, req: Request) {
    const vm = await this.loadTenantVmForActor(actor, vmId);
    this.assertPlanActiveForOperations(vm);
    return vmService.stopVM(vm._id, vm.adminId, buildPlatformVmRequest(req, vm.adminId));
  }

  async restartVm(actor: TenantVmActor, vmId: string, req: Request) {
    const vm = await this.loadTenantVmForActor(actor, vmId);
    this.assertPlanActiveForOperations(vm);
    return vmService.restartVM(vm._id, vm.adminId, buildPlatformVmRequest(req, vm.adminId));
  }

  async openConsole(
    actor: TenantVmActor,
    vmId: string,
    req: Request,
    protocol?: 'rdp' | 'ssh' | 'vnc',
    dimensions?: { width?: number; height?: number }
  ) {
    const vm = await this.loadTenantVmForActor(actor, vmId);
    this.assertPlanActiveForOperations(vm);
    return vmService.openConsole(
      vm._id,
      vm.adminId,
      buildPlatformVmRequest(req, vm.adminId),
      protocol,
      dimensions
    );
  }

  async getAvailableVms(tenantId: mongoose.Types.ObjectId): Promise<TenantVmSummary[]> {
    const vms = await VM.find({
      tenantId,
      assignedTenantUserId: null,
      status: { $nin: ['deleted', 'deleting', 'delete_failed', 'creating'] },
    }).sort({ createdAt: -1 });

    return vms.map((vm) => ({
      id: vm._id.toString(),
      vmid: vm.vmid,
      node: vm.node,
      name: vm.name,
      description: vm.description,
      status: vm.status,
      proxmoxStatus: vm.proxmoxStatus,
      ipAddress: vm.ipAddress,
      cloneType: vm.cloneType,
      allocatedCpu: vm.allocatedCpu,
      allocatedMemoryGb: vm.allocatedMemoryGb,
      allocatedDiskGb: vm.allocatedDiskGb,
      consoleProtocol: vm.consoleProtocol,
      consoleReady: vm.consoleReady,
      planStatus: vm.planStatus ?? null,
      planPeriodEnd: vm.planPeriodEnd ?? null,
      billingPeriod: vm.billingPeriod ?? null,
      assignment: null,
      createdAt: vm.createdAt,
      updatedAt: vm.updatedAt,
    }));
  }

  async getAssignedVmCounts(tenantId: mongoose.Types.ObjectId): Promise<Record<string, number>> {
    const results = await VM.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { tenantId, assignedTenantUserId: { $ne: null } } },
      { $group: { _id: '$assignedTenantUserId', count: { $sum: 1 } } },
    ]);

    const counts: Record<string, number> = {};
    for (const result of results) {
      counts[result._id.toString()] = result.count;
    }
    return counts;
  }

  async getAssignedVmsForUser(
    targetUserId: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<TenantVmSummary[]> {
    const user = await TenantUser.findOne({ _id: targetUserId, tenantId, role: 'tenant_user' })
      .select('_id email isActive createdBy');
    if (!user) throw new NotFoundError('Tenant user not found.');
    if (!user.createdBy || user.createdBy.toString() !== createdBy.toString()) {
      throw new ValidationError('You can only view assignments for tenant users you created.');
    }

    const vms = await VM.find({ tenantId, assignedTenantUserId: targetUserId }).sort({ createdAt: -1 });
    const assignmentMap = new Map([[user._id.toString(), toAssignmentSummary(user)!]]);

    return vms.map((vm) =>
      this.toTenantVmSummary(vm, assignmentMap, {
        id: '',
        tenantId: tenantId.toString(),
        role: 'tenant_admin',
      })
    );
  }

  /**
   * Create tenant users and assign one VM each (1:1).
   * Supports single (vmIds.length === 1) and bulk with the same contract.
   * - emailPrefix vmuser@gmail.com → vmuser1@, vmuser2@, … for N VMs
   * - optional `email` when N === 1 for an explicit address
   * - passwordMode auto | shared (shared requires sharedPassword)
   */
  async onboardVms(
    dto: TenantOnboardDto,
    tenantId: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<TenantBulkAssignPairsResult> {
    const vmObjectIds = dto.vmIds.map((id) => new mongoose.Types.ObjectId(id));
    const vms = await VM.find({
      _id: { $in: vmObjectIds },
      tenantId,
      assignedTenantUserId: null,
      status: { $nin: ['deleted', 'deleting', 'delete_failed', 'creating'] },
    }).lean();

    const vmById = new Map(vms.map((vm) => [vm._id.toString(), vm]));
    const orderedVms = dto.vmIds.map((id) => vmById.get(id));
    if (orderedVms.some((vm) => !vm)) {
      throw new ValidationError('One or more VMs are not available for assignment.');
    }

    type UserSlot = { userId?: mongoose.Types.ObjectId; email: string; password?: string };
    const userSlots: UserSlot[] = [];

    if (dto.vmIds.length === 1 && dto.email) {
      const row = await tenantUserService.createOneForOnboard(
        dto.email,
        dto.passwordMode,
        dto.sharedPassword,
        tenantId,
        createdBy
      );
      userSlots.push({
        userId: row.userId ? new mongoose.Types.ObjectId(row.userId) : undefined,
        email: row.email,
        password: row.password,
      });
      if (row.status !== 'created') {
        return {
          assigned: 0,
          failed: 1,
          pairs: [
            {
              vmId: orderedVms[0]!._id.toString(),
              vmName: orderedVms[0]!.name,
              userEmail: row.email,
              password: row.password,
              status: 'failed',
              error: row.error ?? 'Tenant user creation failed',
            },
          ],
        };
      }
    } else {
      if (!dto.emailPrefix) {
        throw new ValidationError('emailPrefix is required when email is not provided.');
      }
      const bulkResult = await tenantUserService.createBulk(
        {
          emailPrefix: dto.emailPrefix,
          count: dto.vmIds.length,
          password: dto.passwordMode === 'shared' ? dto.sharedPassword : undefined,
        },
        tenantId,
        createdBy
      );

      for (const row of bulkResult.users) {
        if (row.status !== 'created') {
          userSlots.push({ email: row.email, password: row.password });
          continue;
        }

        const user = await TenantUser.findOne({
          tenantId,
          email: row.email,
          role: 'tenant_user',
        }).select('_id email');

        userSlots.push({
          userId: user?._id,
          email: row.email,
          password: row.password,
        });
      }
    }

    const pairs: TenantBulkAssignPairsResult['pairs'] = [];
    let assigned = 0;
    let failed = 0;

    for (let i = 0; i < dto.vmIds.length; i++) {
      const vm = orderedVms[i]!;
      const slot = userSlots[i]!;

      if (!slot.userId) {
        pairs.push({
          vmId: vm._id.toString(),
          vmName: vm.name,
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'Tenant user creation failed',
        });
        failed++;
        continue;
      }

      const update = await VM.updateOne(
        { _id: vm._id, tenantId, assignedTenantUserId: null },
        { $set: { assignedTenantUserId: slot.userId } }
      );

      if (update.modifiedCount === 0) {
        pairs.push({
          vmId: vm._id.toString(),
          vmName: vm.name,
          userId: slot.userId.toString(),
          userEmail: slot.email,
          password: slot.password,
          status: 'failed',
          error: 'VM is no longer available for assignment',
        });
        failed++;
        continue;
      }

      pairs.push({
        vmId: vm._id.toString(),
        vmName: vm.name,
        userId: slot.userId.toString(),
        userEmail: slot.email,
        password: slot.password,
        status: 'assigned',
      });
      assigned++;
    }

    logger.info('Tenant VM onboard complete', {
      tenantId: tenantId.toString(),
      passwordMode: dto.passwordMode,
      assigned,
      failed,
      total: dto.vmIds.length,
    });

    return { assigned, failed, pairs };
  }

  async unassignVm(vmId: mongoose.Types.ObjectId, tenantId: mongoose.Types.ObjectId): Promise<void> {
    const vm = await VM.findOne({ _id: vmId, tenantId });
    if (!vm) throw new NotFoundError('VM not found.');
    if (!vm.assignedTenantUserId) throw new ValidationError('VM is not currently assigned.');

    vm.assignedTenantUserId = undefined;
    await vm.save();

    logger.info('Tenant VM unassigned', {
      tenantId: tenantId.toString(),
      vmId: vmId.toString(),
    });
  }
}

export const tenantVmService = new TenantVmService();
