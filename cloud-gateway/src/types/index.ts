import type { Request } from 'express';

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface VerifiedUser {
  userId: string;
  role: UserRole;
  sessionId: string;
}

export interface TenantContext {
  id: string;
  slug: string;
  status: string;
  ipAccessMode: 'all' | 'restricted';
  allowedIps: string[];
}

export interface GatewayRequest extends Request {
  requestId?: string;
  tenantContext?: TenantContext | null;
}

export interface AuthenticatedRequest extends GatewayRequest {
  user: VerifiedUser;
  requestId: string;
}

export interface TokenValidationResponse {
  valid: boolean;
  userId?: string;
  role?: UserRole;
  sessionId?: string;
  reason?: string;
}

export interface TenantResolveResponse {
  id: string;
  slug: string;
  status: string;
  ipAccessMode: 'all' | 'restricted';
  allowedIps: string[];
}
