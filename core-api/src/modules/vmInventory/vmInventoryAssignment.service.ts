import mongoose from 'mongoose';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import {
  CredentialAssignmentModel,
  type AssigneeType,
  type ICredentialAssignment,
} from '../../models/credentialAssignment.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../../models/externalVmUserAssignment.model';
import { ProjectModel, type IProject } from '../../models/project.model';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { CatalogVmInstanceModel } from '../../models/catalogVmInstance.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { VM } from '../vm/vm.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { inventoryExternalVmMirrorService } from './inventoryExternalVmMirror.service';
import type {
  BulkUnassignResult,
  InventorySource,
  UnassignResult,
} from './vmInventory.types';

/** Just what the release path reads, so lean and hydrated docs both fit. */
type ReleasableAssignment = Pick<
  ICredentialAssignment,
  | '_id'
  | 'credentialId'
  | 'serverId'
  | 'assigneeType'
  | 'assigneeId'
  | 'adminId'
  | 'tenantId'
>;

interface ResolvedAssignee {
  assigneeType: AssigneeType;
  assigneeId: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId | null;
  tenantId: mongoose.Types.ObjectId | null;
}

class VmInventoryAssignmentService {
  /**
   * Client start/end dates are read off the project on every inventory load, so
   * a project without both dates would render blank cells. Assignment is
   * blocked instead.
   */
  private async requireDatedProject(projectId: string): Promise<IProject> {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new ValidationError('Invalid projectId.');
    }
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new NotFoundError('Project not found.');
    if (project.status !== 'active') {
      throw new ValidationError('Project is archived and cannot accept new assignments.');
    }
    if (!project.startDate || !project.endDate) {
      throw new ValidationError(
        'Project has no start/end date. Set both on the project before assigning a VM to it.'
      );
    }
    return project;
  }

  private async resolveAssignee(
    assigneeType: AssigneeType,
    assigneeId: string
  ): Promise<ResolvedAssignee> {
    if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
      throw new ValidationError('Invalid assigneeId.');
    }

    if (assigneeType === 'platform_user') {
      const user = await User.findById(assigneeId).select('_id role isActive createdBy').lean();
      if (!user) throw new NotFoundError('Platform user not found.');
      if (user.role !== 'user') {
        throw new ValidationError('Assignee must be a managed platform user.');
      }
      if (!user.isActive) throw new ValidationError('Platform user is inactive.');
      return {
        assigneeType,
        assigneeId: user._id,
        adminId: user.createdBy ?? null,
        tenantId: null,
      };
    }

    const tenantUser = await TenantUser.findById(assigneeId)
      .select('_id tenantId isActive')
      .lean();
    if (!tenantUser) throw new NotFoundError('Tenant user not found.');
    if (!tenantUser.isActive) throw new ValidationError('Tenant user is inactive.');
    return {
      assigneeType,
      assigneeId: tenantUser._id,
      adminId: null,
      tenantId: tenantUser.tenantId,
    };
  }

  /** Grant one login to one person under one project. */
  async assign(input: {
    credentialId: string;
    assigneeType: AssigneeType;
    assigneeId: string;
    projectId: string;
    assignedBy: mongoose.Types.ObjectId;
  }): Promise<{ assignmentId: string }> {
    if (!mongoose.Types.ObjectId.isValid(input.credentialId)) {
      throw new ValidationError('Invalid credentialId.');
    }
    const credential = await ServerCredentialModel.findById(input.credentialId).lean();
    if (!credential) throw new NotFoundError('Credential not found.');
    if (credential.status !== 'active') {
      throw new ValidationError('Credential is disabled and cannot be assigned.');
    }

    const server = await ServerModel.findById(credential.serverId);
    if (!server) throw new NotFoundError('Server not found.');

    await this.requireDatedProject(input.projectId);
    const assignee = await this.resolveAssignee(input.assigneeType, input.assigneeId);

    // Keep server ownership and assignee stack consistent: adopt the owner on
    // first assignment, reject a cross-owner assignment afterwards.
    if (assignee.tenantId) {
      if (server.adminId) {
        throw new ValidationError(
          'Server is owned by a platform admin and cannot be assigned to a tenant user.'
        );
      }
      if (server.tenantId && !server.tenantId.equals(assignee.tenantId)) {
        throw new ValidationError('Server belongs to a different tenant.');
      }
      if (!server.tenantId) {
        server.tenantId = assignee.tenantId;
        await server.save();
      }
    } else if (assignee.adminId) {
      if (server.tenantId) {
        throw new ValidationError(
          'Server is owned by a tenant and cannot be assigned to a platform user.'
        );
      }
      if (server.adminId && !server.adminId.equals(assignee.adminId)) {
        throw new ValidationError('Server belongs to a different admin.');
      }
      if (!server.adminId) {
        server.adminId = assignee.adminId;
        await server.save();
      }
    }

    const existing = await CredentialAssignmentModel.findOne({
      credentialId: credential._id,
      assigneeId: assignee.assigneeId,
    });

    if (existing) {
      if (existing.status === 'active') {
        throw new ValidationError('This login is already assigned to that user.');
      }
      existing.status = 'active';
      existing.projectId = new mongoose.Types.ObjectId(input.projectId);
      existing.assignedBy = input.assignedBy;
      await existing.save();
      await inventoryExternalVmMirrorService.syncAssignments([existing._id]);
      return { assignmentId: existing._id.toString() };
    }

    const created = await CredentialAssignmentModel.create({
      credentialId: credential._id,
      serverId: server._id,
      assigneeType: assignee.assigneeType,
      assigneeId: assignee.assigneeId,
      adminId: assignee.adminId,
      tenantId: assignee.tenantId,
      projectId: new mongoose.Types.ObjectId(input.projectId),
      assignedBy: input.assignedBy,
    });

    // Publish it to the collections the assignee's portal reads, otherwise the
    // grant exists but no VM shows up for them.
    await inventoryExternalVmMirrorService.syncAssignments([created._id]);

    return { assignmentId: created._id.toString() };
  }

  /**
   * Release one login: the grant goes, portal access goes with it, the lab user
   * created for it is removed, and the VM returns to the free pool once it holds
   * no other login.
   */
  async unassign(assignmentId: string): Promise<UnassignResult> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      throw new ValidationError('Invalid assignmentId.');
    }
    const assignment = await CredentialAssignmentModel.findById(assignmentId).lean();
    if (!assignment) throw new NotFoundError('Assignment not found.');

    const outcome = await this.releaseAssignment(assignment);
    const freed = await this.freeServerIfIdle(assignment.serverId);

    return {
      userDeleted: outcome.userDeleted,
      serverFreed: freed.freed,
      remainingLogins: freed.remaining,
      owner: freed.owner,
    };
  }

  /**
   * Release every login on the selected VMs and return them to the free pool.
   *
   * Also frees VMs that are owned but hold no grants, which is the state left
   * behind by revokes made before unassign cleared ownership.
   */
  async bulkUnassignServers(serverIds: string[]): Promise<BulkUnassignResult> {
    if (serverIds.length === 0) throw new ValidationError('No servers selected.');
    if (serverIds.length > 500) {
      throw new ValidationError('Bulk unassign is capped at 500 servers per request.');
    }

    const ids: mongoose.Types.ObjectId[] = [];
    for (const id of serverIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid serverId "${id}".`);
      }
      ids.push(new mongoose.Types.ObjectId(id));
    }

    const assignments = await CredentialAssignmentModel.find({
      serverId: { $in: ids },
      status: 'active',
    }).lean();

    let loginsUnassigned = 0;
    let usersDeleted = 0;
    for (const assignment of assignments) {
      const outcome = await this.releaseAssignment(assignment);
      loginsUnassigned += 1;
      if (outcome.userDeleted) usersDeleted += 1;
    }

    let serversFreed = 0;
    for (const serverId of ids) {
      const freed = await this.freeServerIfIdle(serverId);
      if (freed.freed) serversFreed += 1;
    }

    return {
      servers: ids.length,
      loginsUnassigned,
      usersDeleted,
      serversFreed,
    };
  }

  /**
   * Delete one grant, withdraw its portal access, and remove the assignee once
   * they hold nothing else.
   */
  private async releaseAssignment(
    assignment: ReleasableAssignment
  ): Promise<{ userDeleted: boolean }> {
    await CredentialAssignmentModel.deleteOne({ _id: assignment._id });
    // Portal access must not outlive the grant.
    await inventoryExternalVmMirrorService.dropAssignment(assignment);

    return { userDeleted: await this.deleteAssigneeIfIdle(assignment) };
  }

  /**
   * Remove a lab user once nothing is left pointing at them.
   *
   * The login is what gets released here, never the VM — that only returns to
   * the free pool. A user is removed only when they hold no other inventory
   * grant and no VM or elastic server from any other flow, so an account still
   * in use anywhere survives. Console operators and admins are never touched.
   */
  private async deleteAssigneeIfIdle(assignment: ReleasableAssignment): Promise<boolean> {
    const otherGrants = await CredentialAssignmentModel.countDocuments({
      assigneeId: assignment.assigneeId,
      status: 'active',
    });
    if (otherGrants > 0) return false;

    if (assignment.assigneeType === 'tenant_user') {
      const user = await TenantUser.findById(assignment.assigneeId)
        .select('_id role isConsoleOperator')
        .lean();
      if (!user || user.role !== 'tenant_user' || user.isConsoleOperator) return false;

      const [vms, elastic] = await Promise.all([
        VM.countDocuments({ assignedTenantUserId: user._id }),
        ExternalVmTenantAssignmentModel.countDocuments({ tenantUserId: user._id }),
      ]);
      if (vms > 0 || elastic > 0) return false;

      await TenantUser.deleteOne({ _id: user._id });
      return true;
    }

    const user = await User.findById(assignment.assigneeId).select('_id role').lean();
    if (!user || user.role !== 'user') return false;

    const [vms, elastic] = await Promise.all([
      VM.countDocuments({ assignedTo: user._id }),
      ExternalVmUserAssignmentModel.countDocuments({ userId: user._id }),
    ]);
    if (vms > 0 || elastic > 0) return false;

    await User.deleteOne({ _id: user._id });
    return true;
  }

  /**
   * Hand a server back to the free pool once its last login is released.
   *
   * A server still holding grants keeps its owner — releasing it would strand
   * the people using it — so the caller is told what remains instead.
   */
  private async freeServerIfIdle(serverId: mongoose.Types.ObjectId): Promise<{
    freed: boolean;
    remaining: number;
    owner: 'admin' | 'tenant' | 'free' | null;
  }> {
    const server = await ServerModel.findById(serverId)
      .select('adminId tenantId projectId')
      .lean();
    if (!server) return { freed: false, remaining: 0, owner: null };

    const remaining = await CredentialAssignmentModel.countDocuments({
      serverId,
      status: 'active',
    });
    if (remaining > 0) {
      return {
        freed: false,
        remaining,
        owner: server.adminId ? 'admin' : server.tenantId ? 'tenant' : 'free',
      };
    }

    if (!server.adminId && !server.tenantId && !server.projectId) {
      return { freed: false, remaining: 0, owner: 'free' };
    }

    // The project link goes too: it only ever described the owner's engagement.
    await ServerModel.updateOne(
      { _id: serverId },
      { $set: { adminId: null, tenantId: null, projectId: null } }
    );
    return { freed: true, remaining: 0, owner: 'free' };
  }

  /** Temporarily bypass the client date window for one assignment. */
  async setOverride(
    assignmentId: string,
    body: { accessOverride: boolean; accessOverrideUntil?: Date | null }
  ): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      throw new ValidationError('Invalid assignmentId.');
    }
    if (body.accessOverride && body.accessOverrideUntil) {
      if (body.accessOverrideUntil.getTime() <= Date.now()) {
        throw new ValidationError('accessOverrideUntil must be in the future.');
      }
    }
    const res = await CredentialAssignmentModel.updateOne(
      { _id: assignmentId },
      {
        $set: {
          accessOverride: body.accessOverride,
          accessOverrideUntil: body.accessOverride ? body.accessOverrideUntil ?? null : null,
        },
      }
    );
    if (res.matchedCount === 0) throw new NotFoundError('Assignment not found.');

    // The portal gates on its own copy of the override, so it has to move too.
    await inventoryExternalVmMirrorService.syncAssignments([
      new mongoose.Types.ObjectId(assignmentId),
    ]);
  }

  /**
   * Grant or clear the override on every active assignment of the selected
   * servers, for when a client engagement is extended before the project dates
   * catch up.
   *
   * Servers holding no assignments are counted and reported rather than failing
   * the batch, since a mixed selection is the normal case.
   */
  async bulkSetOverride(input: {
    serverIds: string[];
    accessOverride: boolean;
    accessOverrideUntil?: Date | null;
  }): Promise<{ updated: number; servers: number; serversWithoutAssignments: number }> {
    if (input.serverIds.length === 0) throw new ValidationError('No servers selected.');
    if (input.serverIds.length > 500) {
      throw new ValidationError('Bulk override is capped at 500 servers per request.');
    }
    if (
      input.accessOverride &&
      input.accessOverrideUntil &&
      input.accessOverrideUntil.getTime() <= Date.now()
    ) {
      throw new ValidationError('accessOverrideUntil must be in the future.');
    }

    const ids: mongoose.Types.ObjectId[] = [];
    for (const id of input.serverIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid serverId "${id}".`);
      }
      ids.push(new mongoose.Types.ObjectId(id));
    }

    const filter = { serverId: { $in: ids }, status: 'active' as const };
    const assignments = await CredentialAssignmentModel.find(filter).select('serverId').lean();

    if (assignments.length > 0) {
      await CredentialAssignmentModel.updateMany(filter, {
        $set: {
          accessOverride: input.accessOverride,
          // Clearing the override drops any expiry with it.
          accessOverrideUntil: input.accessOverride ? input.accessOverrideUntil ?? null : null,
        },
      });
      await inventoryExternalVmMirrorService.syncAssignments(assignments.map((a) => a._id));
    }

    const covered = new Set(assignments.map((a) => a.serverId.toString()));
    return {
      updated: assignments.length,
      servers: covered.size,
      serversWithoutAssignments: ids.length - covered.size,
    };
  }

  /**
   * Map a machine to an owning admin or tenant. Supported for all four sources,
   * since super-admin-created catalog VMs and dedicated servers need this too.
   */
  async mapOwner(input: {
    source: InventorySource;
    sourceId: string;
    adminId?: string | null;
    tenantId?: string | null;
  }): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(input.sourceId)) {
      throw new ValidationError('Invalid sourceId.');
    }
    if (input.adminId && input.tenantId) {
      throw new ValidationError('Provide either adminId or tenantId, not both.');
    }

    let adminId: mongoose.Types.ObjectId | null = null;
    let tenantId: mongoose.Types.ObjectId | null = null;

    if (input.adminId) {
      if (!mongoose.Types.ObjectId.isValid(input.adminId)) {
        throw new ValidationError('Invalid adminId.');
      }
      const admin = await User.findOne({ _id: input.adminId, role: 'admin' })
        .select('_id')
        .lean();
      if (!admin) throw new NotFoundError('Admin not found.');
      adminId = admin._id;
    }
    if (input.tenantId) {
      if (!mongoose.Types.ObjectId.isValid(input.tenantId)) {
        throw new ValidationError('Invalid tenantId.');
      }
      const tenant = await Tenant.findById(input.tenantId).select('_id').lean();
      if (!tenant) throw new NotFoundError('Tenant not found.');
      tenantId = tenant._id;
    }

    const update = { $set: { adminId, tenantId } };

    switch (input.source) {
      case 'inventory': {
        const res = await ServerModel.updateOne({ _id: input.sourceId }, update);
        if (res.matchedCount === 0) throw new NotFoundError('Server not found.');
        return;
      }
      case 'platform_vm': {
        // VPS requires an owning admin; it is never ownerless.
        if (!adminId) {
          throw new ValidationError('Platform VPS must be mapped to an admin.');
        }
        const res = await VM.updateOne({ _id: input.sourceId }, update);
        if (res.matchedCount === 0) throw new NotFoundError('VM not found.');
        return;
      }
      case 'catalog_vm': {
        const instance = await CatalogVmInstanceModel.findById(input.sourceId);
        if (!instance) throw new NotFoundError('Catalog VM instance not found.');
        instance.adminId = adminId ?? undefined;
        instance.tenantId = tenantId ?? undefined;
        await instance.save();
        // Keep the parent in step so its own console shows the same owner.
        await CatalogVmModel.updateOne({ _id: instance.catalogVmId }, update);
        return;
      }
      case 'dedicated_server': {
        const res = await DedicatedServerRequestModel.updateOne({ _id: input.sourceId }, update);
        if (res.matchedCount === 0) throw new NotFoundError('Dedicated server not found.');
        return;
      }
      default:
        throw new ValidationError('Unknown source.');
    }
  }

  /** Assignee picker options for a given owner. */
  async listAssignees(params: { adminId?: string; tenantId?: string }): Promise<{
    assignees: Array<{
      id: string;
      assigneeType: AssigneeType;
      email: string;
      username: string | null;
    }>;
  }> {
    if (params.tenantId) {
      if (!mongoose.Types.ObjectId.isValid(params.tenantId)) {
        throw new ValidationError('Invalid tenantId.');
      }
      const users = await TenantUser.find({
        tenantId: params.tenantId,
        role: 'tenant_user',
        isConsoleOperator: false,
        isActive: true,
      })
        .select('_id email username')
        .sort({ email: 1 })
        .lean();
      return {
        assignees: users.map((u) => ({
          id: u._id.toString(),
          assigneeType: 'tenant_user' as const,
          email: u.email,
          username: u.username ?? null,
        })),
      };
    }

    if (params.adminId) {
      if (!mongoose.Types.ObjectId.isValid(params.adminId)) {
        throw new ValidationError('Invalid adminId.');
      }
      const users = await User.find({
        createdBy: params.adminId,
        role: 'user',
        isActive: true,
      })
        .select('_id email username')
        .sort({ email: 1 })
        .lean();
      return {
        assignees: users.map((u) => ({
          id: u._id.toString(),
          assigneeType: 'platform_user' as const,
          email: u.email,
          username: u.username ?? null,
        })),
      };
    }

    throw new ValidationError('Provide adminId or tenantId.');
  }

  /**
   * All active projects for the owner. Assignment needs both client dates, but
   * undated projects are still returned (with null dates) so the caller can show
   * them as unavailable rather than rendering an unexplained empty list.
   */
  async listAssignableProjects(params: { adminId?: string; tenantId?: string }): Promise<{
    projects: Array<{
      id: string;
      name: string;
      clientName: string;
      startDate: string | null;
      endDate: string | null;
    }>;
  }> {
    const filter: Record<string, unknown> = { status: 'active' };

    if (params.tenantId) filter['tenantId'] = params.tenantId;
    else if (params.adminId) filter['orgId'] = params.adminId;
    else throw new ValidationError('Provide adminId or tenantId.');

    const projects = await ProjectModel.find(filter)
      .select('_id name clientName startDate endDate')
      .sort({ createdAt: -1 })
      .lean();

    return {
      projects: projects.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        clientName: p.clientName,
        startDate: p.startDate ? p.startDate.toISOString() : null,
        endDate: p.endDate ? p.endDate.toISOString() : null,
      })),
    };
  }
}

export const vmInventoryAssignmentService = new VmInventoryAssignmentService();
