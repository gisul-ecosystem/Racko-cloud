import { apiRequest } from './apiClient';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export type SupportTicketStatus =
  | 'open'
  | 'tenant_handling'
  | 'platform_assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type SupportTicketType = 'support' | 'bug' | 'vm_request';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type SupportTicketSource = 'web' | 'email' | 'whatsapp';
export type SupportCommentAuthorRole =
  | 'user'
  | 'tenant_admin'
  | 'support_agent'
  | 'admin'
  | 'super_admin';

export interface SupportTicketVmDetails {
  cpu?: string;
  ram?: string;
  storage?: string;
  os?: string;
  purpose?: string;
}

export interface SupportTicketComment {
  _id: string;
  authorId: string;
  authorName: string;
  authorRole: SupportCommentAuthorRole;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  ticketNumber: string;
  tenantId?: string;
  subject: string;
  description: string;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  source: SupportTicketSource;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  platformAssigneeId?: string;
  platformAssigneeName?: string;
  tenantAssigneeId?: string;
  tenantAssigneeName?: string;
  escalatedAt?: string;
  escalatedByName?: string;
  resolvedAt?: string;
  closedAt?: string;
  vmDetails?: SupportTicketVmDetails;
  comments: SupportTicketComment[];
  createdAt: string;
  updatedAt: string;
}

export interface SupportQueueAgent {
  _id: string;
  name: string;
  email: string;
  isNext: boolean;
  openTicketCount: number;
}

export interface SupportQueueOverview {
  totalAssigned: number;
  lastIndex: number;
  agentCount: number;
  nextAgentId: string | null;
  agents: SupportQueueAgent[];
}

export interface SupportAgent {
  _id: string;
  name?: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSupportAgentPayload {
  name: string;
  email: string;
  password: string;
}

export interface SupportTicketFilters {
  status?: SupportTicketStatus;
  type?: SupportTicketType;
  priority?: SupportTicketPriority;
  assigneeId?: string;
  skip?: number;
  limit?: number;
}

export interface MyTicketsFilters {
  status?: SupportTicketStatus;
  skip?: number;
  limit?: number;
}

export interface UpdateTicketPayload {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
}

function buildTicketQuery(filters: SupportTicketFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.type) params.set('type', filters.type);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.skip != null) params.set('skip', String(filters.skip));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchAllTickets(
  filters: SupportTicketFilters = {}
): Promise<SupportTicket[]> {
  const res = await apiRequest<ApiResponse<{ tickets: SupportTicket[] }>>(
    `/api/v1/support/tickets${buildTicketQuery(filters)}`
  );
  return res.data.tickets;
}

export async function fetchMyTickets(filters: MyTicketsFilters = {}): Promise<SupportTicket[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.skip != null) params.set('skip', String(filters.skip));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const res = await apiRequest<ApiResponse<{ tickets: SupportTicket[] }>>(
    `/api/v1/support/tickets/my${qs ? `?${qs}` : ''}`
  );
  return res.data.tickets;
}

export async function fetchTicketById(ticketId: string): Promise<SupportTicket> {
  const res = await apiRequest<ApiResponse<{ ticket: SupportTicket }>>(
    `/api/v1/support/tickets/${ticketId}`
  );
  return res.data.ticket;
}

/** Agent-scoped ticket detail — same endpoint, assigned tickets only enforced server-side. */
export async function fetchMyTicketById(ticketId: string): Promise<SupportTicket> {
  return fetchTicketById(ticketId);
}

/** @deprecated Use fetchAllTickets — kept for dashboard compatibility */
export async function fetchSupportTickets(limit = 200): Promise<SupportTicket[]> {
  return fetchAllTickets({ limit });
}

export async function fetchSupportQueue(): Promise<SupportQueueOverview> {
  const res = await apiRequest<ApiResponse<{ queue: SupportQueueOverview }>>(
    '/api/v1/support/queue'
  );
  return res.data.queue;
}

export async function fetchSupportAgents(): Promise<SupportAgent[]> {
  const res = await apiRequest<ApiResponse<{ agents: SupportAgent[] }>>('/api/v1/support/agents');
  return res.data.agents;
}

/** Creates a platform user with role support_agent. */
export async function createSupportAgent(payload: CreateSupportAgentPayload): Promise<SupportAgent> {
  const res = await apiRequest<ApiResponse<{ agent: SupportAgent }>>('/api/v1/support/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data.agent;
}

/** Activate or deactivate a support agent via the platform user endpoint. */
export async function toggleAgentStatus(userId: string, isActive: boolean): Promise<void> {
  await apiRequest(`/api/v1/users/${userId}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

export async function reassignTicket(
  ticketId: string,
  agentId: string
): Promise<SupportTicket> {
  const res = await apiRequest<ApiResponse<{ ticket: SupportTicket }>>(
    `/api/v1/support/tickets/${ticketId}/reassign`,
    {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    }
  );
  return res.data.ticket;
}

export async function updateTicket(
  ticketId: string,
  payload: UpdateTicketPayload
): Promise<SupportTicket> {
  const res = await apiRequest<ApiResponse<{ ticket: SupportTicket }>>(
    `/api/v1/support/tickets/${ticketId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  return res.data.ticket;
}

export async function updateTicketStatus(
  ticketId: string,
  status: SupportTicketStatus
): Promise<SupportTicket> {
  return updateTicket(ticketId, { status });
}

export async function addComment(
  ticketId: string,
  body: string,
  isInternal: boolean
): Promise<SupportTicket> {
  const res = await apiRequest<ApiResponse<{ ticket: SupportTicket }>>(
    `/api/v1/support/tickets/${ticketId}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body, isInternal }),
    }
  );
  return res.data.ticket;
}
