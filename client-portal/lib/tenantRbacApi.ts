import { tenantPortalRequest } from './tenantPortalApiClient';

export interface OrgRbacPermissionDef {
  key: string;
  label: string;
  group: string;
}

export interface OrgRbacRole {
  _id: string;
  slug: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantRbacPerson {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  isTenantAdmin?: boolean;
  roleIds: string[];
  roleNames: string[];
  permissions: string[];
}

export interface MyTenantRbac {
  role: string;
  tenantId: string;
  isTenantAdmin: boolean;
  permissions: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export async function fetchMyTenantRbac(): Promise<MyTenantRbac> {
  return unwrap(tenantPortalRequest<ApiEnvelope<MyTenantRbac>>('/api/v1/tenant-rbac/me'));
}

export async function fetchTenantRbacCatalog(): Promise<OrgRbacPermissionDef[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ permissions: OrgRbacPermissionDef[] }>>(
      '/api/v1/tenant-rbac/permissions'
    )
  );
  return data.permissions;
}

export async function fetchTenantRbacRoles(): Promise<OrgRbacRole[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ roles: OrgRbacRole[]; total: number }>>(
      '/api/v1/tenant-rbac/roles'
    )
  );
  return data.roles;
}

export async function createTenantRbacRole(input: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<OrgRbacRole> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ role: OrgRbacRole }>>('/api/v1/tenant-rbac/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.role;
}

export async function updateTenantRbacRole(
  id: string,
  input: {
    name?: string;
    description?: string;
    permissions?: string[];
    isActive?: boolean;
  }
): Promise<OrgRbacRole> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ role: OrgRbacRole }>>(`/api/v1/tenant-rbac/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );
  return data.role;
}

export async function fetchTenantRbacPeople(): Promise<TenantRbacPerson[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ people: TenantRbacPerson[]; total: number }>>(
      '/api/v1/tenant-rbac/people'
    )
  );
  return data.people;
}

export async function setTenantRbacUserRoles(
  userId: string,
  roleIds: string[]
): Promise<string[]> {
  const data = await unwrap(
    tenantPortalRequest<ApiEnvelope<{ roleIds: string[] }>>(
      `/api/v1/tenant-rbac/people/${userId}/roles`,
      { method: 'PUT', body: JSON.stringify({ roleIds }) }
    )
  );
  return data.roleIds;
}
