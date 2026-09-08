import mongoose from 'mongoose';
import { ServerModel } from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import {
  CredentialAssignmentModel,
  type AssigneeType,
} from '../../models/credentialAssignment.model';
import { ProjectModel, type IProject } from '../../models/project.model';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { User } from '../../models/user.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { CatalogVmInstanceModel } from '../../models/catalogVmInstance.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { VM } from '../vm/vm.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { InventorySource } from './vmInventory.types';

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

    return { assignmentId: created._id.toString() };
  }

  async revoke(assignmentId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      throw new ValidationError('Invalid assignmentId.');
    }
    const res = await CredentialAssignmentModel.deleteOne({ _id: assignmentId });
    if (res.deletedCount === 0) throw new NotFoundError('Assignment not found.');
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

  /** Projects that can accept an assignment — active, and with both dates set. */
  async listAssignableProjects(params: { adminId?: string; tenantId?: string }): Promise<{
    projects: Array<{
      id: string;
      name: string;
      clientName: string;
      startDate: string;
      endDate: string;
    }>;
  }> {
    const filter: Record<string, unknown> = {
      status: 'active',
      startDate: { $ne: null },
      endDate: { $ne: null },
    };

    if (params.tenantId) filter['tenantId'] = params.tenantId;
    else if (params.adminId) filter['orgId'] = params.adminId;
    else throw new ValidationError('Provide adminId or tenantId.');

    const projects = await ProjectModel.find(filter)
      .select('_id name clientName startDate endDate')
      .sort({ createdAt: -1 })
      .lean();

    return {
      projects: projects
        .filter((p) => p.startDate && p.endDate)
        .map((p) => ({
          id: p._id.toString(),
          name: p.name,
          clientName: p.clientName,
          startDate: p.startDate!.toISOString(),
          endDate: p.endDate!.toISOString(),
        })),
    };
  }
}

export const vmInventoryAssignmentService = new VmInventoryAssignmentService();
