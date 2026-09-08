import mongoose from 'mongoose';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import {
  Ticket,
  type ITicket,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
  type TicketCommentAuthorRole,
} from './support.model';
import { supportQueueService, type IQueueAgent } from './support.queue';
import { sendNewTicketAcknowledgementEmail, sendTicketEscalatedEmail } from './support.email';

async function nextTicketNumber(): Promise<string> {
  const count = await Ticket.countDocuments();
  return `RCK-${String(count + 1).padStart(4, '0')}`;
}

export interface CreateTenantTicketPayload {
  type: TicketType;
  subject: string;
  description: string;
  priority?: TicketPriority;
  vmCpu?: string;
  vmRam?: string;
  vmStorage?: string;
  vmOs?: string;
  vmPurpose?: string;
}

export interface ListTenantTicketsFilters {
  status?: TicketStatus;
  skip?: number;
  limit?: number;
}

export class TenantSupportService {
  async createTicket(
    tenantId: string,
    tenantUserId: string,
    requesterName: string,
    requesterEmail: string,
    requesterPhone: string | undefined,
    payload: CreateTenantTicketPayload
  ): Promise<ITicket> {
    const ticket = await Ticket.create({
      ticketNumber: await nextTicketNumber(),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      submittedByTenantUserId: new mongoose.Types.ObjectId(tenantUserId),
      requesterName,
      requesterEmail,
      requesterPhone,
      type: payload.type,
      subject: payload.subject,
      description: payload.description,
      priority: payload.priority ?? 'medium',
      source: 'web',
      status: 'open',
      ...(payload.type === 'vm_request'
        ? {
            vmDetails: {
              cpu: payload.vmCpu,
              ram: payload.vmRam,
              storage: payload.vmStorage,
              os: payload.vmOs,
              purpose: payload.vmPurpose,
            },
          }
        : {}),
    });

    void sendNewTicketAcknowledgementEmail({
      requesterEmail,
      requesterName,
      ticketNumber: ticket.ticketNumber,
      subject: payload.subject,
    });

    return ticket.toJSON() as unknown as ITicket;
  }

  async listForTenant(
    tenantId: string,
    tenantUserId: string,
    isTenantAdmin: boolean,
    filters: ListTenantTicketsFilters = {}
  ): Promise<ITicket[]> {
    const query: Record<string, unknown> = isTenantAdmin
      ? { tenantId: new mongoose.Types.ObjectId(tenantId) }
      : {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          submittedByTenantUserId: new mongoose.Types.ObjectId(tenantUserId),
        };

    if (filters.status) {
      query['status'] = filters.status;
    }

    const skip = filters.skip ?? 0;
    const limit = filters.limit ?? 50;

    return Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as ITicket[];
  }

  async getOne(tenantId: string, ticketId: string): Promise<ITicket> {
    const ticket = await Ticket.findOne({
      _id: new mongoose.Types.ObjectId(ticketId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).lean();

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    return ticket as unknown as ITicket;
  }

  async assignToSelf(
    tenantId: string,
    ticketId: string,
    tenantAdminId: string,
    tenantAdminName: string
  ): Promise<ITicket> {
    const ticket = await Ticket.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(ticketId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        status: 'open',
      },
      {
        $set: {
          status: 'tenant_handling',
          tenantAssigneeId: new mongoose.Types.ObjectId(tenantAdminId),
          tenantAssigneeName: tenantAdminName,
        },
      },
      { new: true }
    );

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    return ticket.toJSON() as unknown as ITicket;
  }

  async resolveAsTenant(
    tenantId: string,
    ticketId: string,
    tenantAdminId: string
  ): Promise<ITicket> {
    const ticket = await Ticket.findOne({
      _id: new mongoose.Types.ObjectId(ticketId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    if (ticket.tenantAssigneeId?.toString() !== tenantAdminId) {
      throw new ForbiddenError('You are not assigned to this ticket.');
    }

    ticket.status = 'resolved';
    ticket.resolvedAt = new Date();
    await ticket.save();

    return ticket.toJSON() as unknown as ITicket;
  }

  async escalateToPlatform(
    tenantId: string,
    ticketId: string,
    escalatedByTenantUserId: string,
    escalatedByName: string,
    agents: IQueueAgent[],
    note?: string
  ): Promise<ITicket> {
    const ticket = await Ticket.findOne({
      _id: new mongoose.Types.ObjectId(ticketId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $in: ['open', 'tenant_handling'] },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found.');
    }

    const agent = await supportQueueService.nextAgent(agents);

    ticket.status = 'platform_assigned';
    ticket.escalatedAt = new Date();
    ticket.escalatedByTenantUserId = new mongoose.Types.ObjectId(escalatedByTenantUserId);
    ticket.escalatedByName = escalatedByName;

    if (agent) {
      ticket.platformAssigneeId = new mongoose.Types.ObjectId(String(agent._id));
      ticket.platformAssigneeName = agent.name;
    }

    if (note) {
      ticket.comments.push({
        _id: new mongoose.Types.ObjectId(),
        authorId: new mongoose.Types.ObjectId(escalatedByTenantUserId),
        authorName: escalatedByName,
        authorRole: 'tenant_admin',
        body: `[Escalation note] ${note}`,
        isInternal: true,
        createdAt: new Date(),
      });
    }

    await ticket.save();

    if (agent) {
      void sendTicketEscalatedEmail({
        agentEmail: agent.email,
        agentName: agent.name,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        escalatedByName,
        note,
      });
    }

    return ticket.toJSON() as unknown as ITicket;
  }

  async addComment(
    tenantId: string,
    ticketId: string,
    authorId: string,
    authorName: string,
    authorRole: 'user' | 'tenant_admin',
    body: string,
    isInternal: boolean
  ): Promise<ITicket> {
    const ticket = await Ticket.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(ticketId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
      },
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
}

export const tenantSupportService = new TenantSupportService();
