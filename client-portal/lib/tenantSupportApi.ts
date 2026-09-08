import { tenantPortalRequest } from './tenantPortalApiClient';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export type TenantTicketType = 'support' | 'bug' | 'vm_request';
export type TenantTicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TenantTicketStatus =
  | 'open'
  | 'tenant_handling'
  | 'platform_assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type TenantTicketSource = 'web' | 'email' | 'whatsapp';

export interface TenantTicketVmDetails {
  cpu?: string;
  ram?: string;
  storage?: string;
  os?: string;
  purpose?: string;
}

export interface TenantTicketComment {
  _id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TenantSupportTicket {
  _id: string;
  ticketNumber: string;
  tenantId?: string;
  subject: string;
  description: string;
  type: TenantTicketType;
  priority: TenantTicketPriority;
  status: TenantTicketStatus;
  source: TenantTicketSource;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  tenantAssigneeId?: string;
  tenantAssigneeName?: string;
  platformAssigneeId?: string;
  platformAssigneeName?: string;
  escalatedAt?: string;
  escalatedByName?: string;
  resolvedAt?: string;
  closedAt?: string;
  vmDetails?: TenantTicketVmDetails;
  comments?: TenantTicketComment[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmitTenantTicketPayload {
  type: TenantTicketType;
  subject: string;
  description: string;
  priority?: TenantTicketPriority;
  requesterPhone?: string;
  vmCpu?: string;
  vmRam?: string;
  vmStorage?: string;
  vmOs?: string;
  vmPurpose?: string;
}

export interface TenantTicketFilters {
  status?: TenantTicketStatus;
  skip?: number;
  limit?: number;
}

function buildTicketQuery(filters: TenantTicketFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.skip != null) params.set('skip', String(filters.skip));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function submitTicket(payload: SubmitTenantTicketPayload): Promise<TenantSupportTicket> {
  const res = await tenantPortalRequest<ApiResponse<{ ticket: TenantSupportTicket }>>(
    '/api/v1/tenant/support/tickets',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  return res.data.ticket;
}

export async function fetchMyTenantTickets(
  filters: TenantTicketFilters = {}
): Promise<TenantSupportTicket[]> {
  const res = await tenantPortalRequest<ApiResponse<{ tickets: TenantSupportTicket[] }>>(
    `/api/v1/tenant/support/tickets${buildTicketQuery(filters)}`
  );
  return res.data.tickets;
}

export async function fetchTenantTicketById(ticketId: string): Promise<TenantSupportTicket> {
  const res = await tenantPortalRequest<ApiResponse<{ ticket: TenantSupportTicket }>>(
    `/api/v1/tenant/support/tickets/${ticketId}`
  );
  return res.data.ticket;
}

export async function addTenantComment(
  ticketId: string,
  body: string,
  isInternal: boolean
): Promise<TenantSupportTicket> {
  const res = await tenantPortalRequest<ApiResponse<{ ticket: TenantSupportTicket }>>(
    `/api/v1/tenant/support/tickets/${ticketId}/comments`,
    { method: 'POST', body: JSON.stringify({ body, isInternal }) }
  );
  return res.data.ticket;
}

export async function escalateTicket(
  ticketId: string,
  note?: string
): Promise<TenantSupportTicket> {
  const res = await tenantPortalRequest<ApiResponse<{ ticket: TenantSupportTicket }>>(
    `/api/v1/tenant/support/tickets/${ticketId}/escalate`,
    { method: 'POST', body: JSON.stringify(note != null ? { note } : {}) }
  );
  return res.data.ticket;
}

export async function assignTicketToSelf(ticketId: string): Promise<TenantSupportTicket> {
  const res = await tenantPortalRequest<ApiResponse<{ ticket: TenantSupportTicket }>>(
    `/api/v1/tenant/support/tickets/${ticketId}/assign`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return res.data.ticket;
}

export async function resolveTenantTicket(ticketId: string): Promise<TenantSupportTicket> {
  const res = await tenantPortalRequest<ApiResponse<{ ticket: TenantSupportTicket }>>(
    `/api/v1/tenant/support/tickets/${ticketId}/resolve`,
    { method: 'PATCH', body: JSON.stringify({}) }
  );
  return res.data.ticket;
}
