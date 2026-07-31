import { apiRequest } from './apiClient';

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

export interface PlatformRbacPerson {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  isOrgOwner?: boolean;
  roleIds: string[];
  roleNames: string[];
  permissions: string[];
}

export interface MyPlatformRbac {
  role: string;
  orgId: string;
  isOrgOwner: boolean;
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

export async function fetchMyPlatformRbac(): Promise<MyPlatformRbac> {
  return unwrap(apiRequest<ApiEnvelope<MyPlatformRbac>>('/api/v1/platform-rbac/me'));
}

export async function fetchPlatformRbacCatalog(): Promise<OrgRbacPermissionDef[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ permissions: OrgRbacPermissionDef[] }>>(
      '/api/v1/platform-rbac/permissions'
    )
  );
  return data.permissions;
}

export async function fetchPlatformRbacRoles(): Promise<OrgRbacRole[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ roles: OrgRbacRole[]; total: number }>>('/api/v1/platform-rbac/roles')
  );
  return data.roles;
}

export async function createPlatformRbacRole(input: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<OrgRbacRole> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ role: OrgRbacRole }>>('/api/v1/platform-rbac/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.role;
}

export async function updatePlatformRbacRole(
  id: string,
  input: {
    name?: string;
    description?: string;
    permissions?: string[];
    isActive?: boolean;
  }
): Promise<OrgRbacRole> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ role: OrgRbacRole }>>(`/api/v1/platform-rbac/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );
  return data.role;
}

export async function fetchPlatformRbacPeople(): Promise<PlatformRbacPerson[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ people: PlatformRbacPerson[]; total: number }>>(
      '/api/v1/platform-rbac/people'
    )
  );
  return data.people;
}

export async function setPlatformRbacUserRoles(
  userId: string,
  roleIds: string[]
): Promise<string[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ roleIds: string[] }>>(
      `/api/v1/platform-rbac/people/${userId}/roles`,
      { method: 'PUT', body: JSON.stringify({ roleIds }) }
    )
  );
  return data.roleIds;
}

export async function invitePlatformOperator(input: {
  email: string;
  temporaryPassword: string;
  roleIds: string[];
}): Promise<{ _id: string; email: string; role: string }> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ user: { _id: string; email: string; role: string } }>>(
      '/api/v1/platform-rbac/people/operators',
      { method: 'POST', body: JSON.stringify(input) }
    )
  );
  return data.user;
}
