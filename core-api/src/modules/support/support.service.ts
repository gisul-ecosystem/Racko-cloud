import mongoose from 'mongoose';
import { User, type IUser } from '../../models/user.model';
import { ProjectModel } from '../../models/project.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { ExternalVmTenantAssignmentModel } from '../../models/externalVmTenantAssignment.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { VM } from '../vm/vm.model';
import { ConflictError, NotFoundError } from '../../utils/errors';
import {
  Ticket,
  type ITicket,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
  type TicketCommentAuthorRole,
} from './support.model';
import { supportQueueService, type IQueueAgent } from './support.queue';
import {
  sendTicketAssignedEmail,
  sendTicketStatusUpdateEmail,
} from './support.email';

export interface ListAllTicketsFilters {
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  assigneeId?: string;
  tenantId?: string;
  skip?: number;
  limit?: number;
}

export interface UpdateTicketPayload {
  status?: TicketStatus;
  priority?: TicketPriority;
  platformAssigneeId?: string;
  platformAssigneeName?: string;
}

/** Persist a valid comment author role for platform users (never store userId). */
export function normalizePlatformCommentAuthorRole(role: string): TicketCommentAuthorRole {
  switch (role) {
    case 'super_admin':
    case 'support_agent':
    case 'admin':
    case 'tenant_admin':
    case 'user':
      return role;
    case 'staff':
      return 'support_agent';
    default:
      return 'support_agent';
  }
}

export class SupportService {
  async listAll(filters: ListAllTicketsFilters = {}): Promise<ITicket[]> {
    const query: Record<string, unknown> = {};

    if (filters.status) {
      query['status'] = filters.status;
    }
    if (filters.type) {
      query['type'] = filters.type;
    }
    if (filters.priority) {
      query['priority'] = filters.priority;
    }
    if (filters.assigneeId) {
      query['platformAssigneeId'] = new mongoose.Types.ObjectId(filters.assigneeId);
    }
    if (filters.tenantId) {
      query['tenantId'] = new mongoose.Types.ObjectId(filters.tenantId);
    }

    const skip = filters.skip ?? 0;
    const limit = filters.limit ?? 50;

    return Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('projectId', 'clientName name')
      .lean() as unknown as ITicket[];
  }

  async myTickets(
    agentId: string,
    status?: TicketStatus,
    skip = 0,
    limit = 50
  ): Promise<ITicket[]> {
    const query: Record<string, unknown> = {
      platformAssigneeId: new mongoose.Types.ObjectId(agentId),
    };

    if (status) {
      query['status'] = status;
    }

    return Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('projectId', 'clientName name')
      .lean() as unknown as ITicket[];
  }

  async getOne(ticketId: string): Promise<ITicket> {
    const ticket = await Ticket.findById(ticketId)
      .populate('projectId', 'clientName name')
      .lean();

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    return ticket as unknown as ITicket;
  }

  async updateTicket(
    ticketId: string,
    _agentId: string,
    payload: UpdateTicketPayload
  ): Promise<ITicket> {
    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    const previousStatus = ticket.status;

    if (payload.status === 'resolved') {
      ticket.resolvedAt = new Date();
    }
    if (payload.status === 'closed') {
      ticket.closedAt = new Date();
    }

    if (payload.status !== undefined) {
      ticket.status = payload.status;
    }
    if (payload.priority !== undefined) {
      ticket.priority = payload.priority;
    }
    if (payload.platformAssigneeId !== undefined) {
      ticket.platformAssigneeId = new mongoose.Types.ObjectId(payload.platformAssigneeId);
    }
    if (payload.platformAssigneeName !== undefined) {
      ticket.platformAssigneeName = payload.platformAssigneeName;
    }

    await ticket.save();

    if (payload.status !== undefined && payload.status !== previousStatus) {
      void sendTicketStatusUpdateEmail({
        requesterEmail: ticket.requesterEmail,
        requesterName: ticket.requesterName,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        newStatus: payload.status,
      });
    }

    return ticket.toJSON() as unknown as ITicket;
  }

  async reassign(ticketId: string, agentId: string, _adminId: string): Promise<ITicket> {
    const agent = await User.findOne({
      _id: new mongoose.Types.ObjectId(agentId),
      role: 'support_agent',
      isActive: true,
    });

    if (!agent) {
      throw new NotFoundError('Agent not found.');
    }

    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      {
        $set: {
          platformAssigneeId: agent._id,
          platformAssigneeName: agent.name || agent.email,
        },
      },
      { new: true }
    );

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    void sendTicketAssignedEmail({
      agentEmail: agent.email,
      agentName: agent.name || agent.email,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      type: ticket.type,
      priority: ticket.priority,
    });

    return ticket.toJSON() as unknown as ITicket;
  }

  async addComment(
    ticketId: string,
    authorId: string,
    authorName: string,
    authorRole: string,
    body: string,
    isInternal: boolean
  ): Promise<ITicket> {
    const ticket = await Ticket.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(ticketId) },
      {
        $push: {
          comments: {
            authorId: new mongoose.Types.ObjectId(authorId),
            authorName,
            authorRole: authorRole as TicketCommentAuthorRole,
            body,
            isInternal,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    return ticket.toJSON() as unknown as ITicket;
  }

  async queueOverview(): Promise<object> {
    const agentsRaw = await User.find({
      role: 'support_agent',
      isActive: true,
    })
      .select('_id name email')
      .sort({ _id: 1 })
      .lean();

    const agentsWithCounts = await Promise.all(
      agentsRaw.map(async (agent) => {
        const openTicketCount = await Ticket.countDocuments({
          platformAssigneeId: agent._id,
          status: { $nin: ['resolved', 'closed'] },
        });

        return {
          _id: agent._id,
          name: agent.name || agent.email,
          email: agent.email,
          openTicketCount,
        };
      })
    );

    const queueAgents: IQueueAgent[] = agentsWithCounts.map(({ _id, name, email }) => ({
      _id,
      name,
      email,
    }));

    const queueStats = await supportQueueService.getQueueStats(queueAgents);
    const queueAgentRows = (queueStats as { agents: Array<{ _id: unknown; isNext: boolean }> })
      .agents;

    const openCountByAgentId = new Map(
      agentsWithCounts.map((agent) => [String(agent._id), agent.openTicketCount])
    );

    return {
      ...queueStats,
      agents: queueAgentRows.map((agent) => ({
        ...agent,
        openTicketCount: openCountByAgentId.get(String(agent._id)) ?? 0,
      })),
    };
  }

  async createAgent(
    input: { name: string; email: string; password: string },
    actorId: string
  ): Promise<{ _id: string; name: string; email: string; isActive: boolean; createdAt: Date }> {
    const email = input.email.trim().toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      throw new ConflictError('Email already in use.');
    }

    const user = await User.create({
      email,
      name: input.name.trim(),
      password: input.password,
      role: 'support_agent',
      isEmailVerified: true,
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(actorId),
    });

    return {
      _id: user._id.toString(),
      name: user.name || user.email,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }
}

export const supportService = new SupportService();

async function getRoundRobinAgent(): Promise<IUser | null> {
  return User.findOneAndUpdate(
    { role: 'support_agent', isActive: true },
    { $inc: { ticketCount: 1 } },
    { sort: { ticketCount: 1 }, new: true }
  );
}

/** Resolve a tenant user's project via resource assignments (VM, elastic server, etc.). */
export async function resolveProjectForTenantUser(
  tenantId: string,
  tenantUserId: string
): Promise<string | null> {
  if (!mongoose.Types.ObjectId.isValid(tenantId) || !mongoose.Types.ObjectId.isValid(tenantUserId)) {
    return null;
  }

  const tenantOid = new mongoose.Types.ObjectId(tenantId);
  const userOid = new mongoose.Types.ObjectId(tenantUserId);

  const vm = await VM.findOne({
    tenantId: tenantOid,
    assignedTenantUserId: userOid,
    projectId: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .select('projectId')
    .lean();
  if (vm?.projectId) return vm.projectId.toString();

  const externalAssign = await ExternalVmTenantAssignmentModel.findOne({
    tenantId: tenantOid,
    tenantUserId: userOid,
    status: 'active',
  })
    .sort({ createdAt: -1 })
    .select('externalVmId')
    .lean();
  if (externalAssign?.externalVmId) {
    const externalVm = await ExternalVMModel.findById(externalAssign.externalVmId)
      .select('projectId')
      .lean();
    if (externalVm?.projectId) return externalVm.projectId.toString();
  }

  const dedicated = await DedicatedServerRequestModel.findOne({
    tenantId: tenantOid,
    tenantUserId: userOid,
    projectId: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .select('projectId')
    .lean();
  if (dedicated?.projectId) return dedicated.projectId.toString();

  const catalogVm = await CatalogVmModel.findOne({
    tenantId: tenantOid,
    tenantUserId: userOid,
    projectId: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .select('projectId')
    .lean();
  if (catalogVm?.projectId) return catalogVm.projectId.toString();

  return null;
}

export async function assignTicketAgent(
  _tenantId: string,
  projectId?: string | null
): Promise<string | null> {
  if (projectId) {
    const project = await ProjectModel.findById(projectId)
      .select('supportAgentId supportEscalationLog')
      .populate<{ supportAgentId: IUser | null }>({
        path: 'supportAgentId',
        select: 'isActive role',
      });

    const projectAgent = project?.supportAgentId ?? null;

    if (projectAgent?.isActive && projectAgent.role === 'support_agent') {
      return projectAgent._id.toString();
    }

    if (project && projectAgent) {
      const fallbackAgent = await getRoundRobinAgent();
      if (fallbackAgent) {
        project.supportEscalationLog.push({
          originalAgentId: projectAgent._id,
          fallbackAgentId: fallbackAgent._id,
          reason: 'agent_inactive',
          escalatedAt: new Date(),
        });
        await project.save();
        return fallbackAgent._id.toString();
      }
    }
  }

  const agent = await getRoundRobinAgent();
  return agent?._id.toString() ?? null;
}

async function loadPlatformAssignee(
  agentId: string
): Promise<{ platformAssigneeId: mongoose.Types.ObjectId; platformAssigneeName: string }> {
  const agent = await User.findById(agentId).select('name email').lean();
  return {
    platformAssigneeId: new mongoose.Types.ObjectId(agentId),
    platformAssigneeName: agent?.name?.trim() || agent?.email || 'Support',
  };
}

/** Read-only: who would be picked next for project assignment (no counter update). */
export async function previewNextSupportAgent(): Promise<{
  _id: string;
  name: string;
  email: string;
} | null> {
  const agent = await User.findOne(
    { role: 'support_agent', isActive: true },
    { _id: 1, name: 1, email: 1 }
  )
    .sort({ assignedProjectCount: 1, _id: 1 })
    .lean();
  if (!agent) return null;
  return {
    _id: agent._id.toString(),
    name: agent.name?.trim() || agent.email,
    email: agent.email,
  };
}

/** Pick the active support agent with the fewest assigned projects (round-robin). */
export async function assignProjectSupportAgent(_projectId: string): Promise<IUser | null> {
  const agent = await User.findOneAndUpdate(
    { role: 'support_agent', isActive: true },
    { $inc: { assignedProjectCount: 1 } },
    { sort: { assignedProjectCount: 1 }, new: true }
  );
  return agent;
}

export { loadPlatformAssignee };
