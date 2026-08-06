import { apiRequest } from './apiClient';

export interface RbacPermissionDef {
  key: string;
  label: string;
  group: string;
}

export interface RbacRole {
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

export interface RbacPerson {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  roleIds: string[];
  roleNames: string[];
  permissions: string[];
}

export interface MyRbacPermissions {
  role: string;
  permissions: string[];
  /** Assigned RBAC role slugs (e.g. ceo). Empty for super_admin. */
  roleSlugs?: string[];
  isSuperAdmin: boolean;
}

/** Internal slug for the Executive home role — never show "ceo" in UI labels. */
export const EXECUTIVE_ROLE_SLUG = 'ceo';

/** Business overview home for the Executive role (not named Analytics). */
export const SUPER_ADMIN_OVERVIEW_PATH = '/super-admin-console/overview';

export function hasExecutiveHomeRole(perms: MyRbacPermissions | null | undefined): boolean {
  if (!perms || perms.isSuperAdmin) return false;
  return (perms.roleSlugs ?? []).includes(EXECUTIVE_ROLE_SLUG);
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

export async function fetchMyRbacPermissions(): Promise<MyRbacPermissions> {
  return unwrap(apiRequest<ApiEnvelope<MyRbacPermissions>>('/api/v1/rbac/me'));
}

export async function fetchRbacPermissionCatalog(): Promise<RbacPermissionDef[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ permissions: RbacPermissionDef[] }>>('/api/v1/rbac/permissions')
  );
  return data.permissions;
}

export async function fetchRbacRoles(): Promise<RbacRole[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ roles: RbacRole[]; total: number }>>('/api/v1/rbac/roles')
  );
  return data.roles;
}

export async function createRbacRole(input: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<RbacRole> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ role: RbacRole }>>('/api/v1/rbac/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.role;
}

export async function updateRbacRole(
  id: string,
  input: {
    name?: string;
    description?: string;
    permissions?: string[];
    isActive?: boolean;
  }
): Promise<RbacRole> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ role: RbacRole }>>(`/api/v1/rbac/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );
  return data.role;
}

export async function fetchRbacPeople(): Promise<RbacPerson[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ people: RbacPerson[]; total: number }>>('/api/v1/rbac/people')
  );
  return data.people;
}

export async function setRbacUserRoles(userId: string, roleIds: string[]): Promise<RbacPerson> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ person: RbacPerson }>>(`/api/v1/rbac/people/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    })
  );
  return data.person;
}

export async function deleteStaffUser(userId: string): Promise<{ email: string }> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ email: string }>>(`/api/v1/rbac/people/${userId}`, {
      method: 'DELETE',
    })
  );
  return data;
}

/** Returned when the email belongs to an existing non-staff account. */
export const PROMOTE_EXISTING_USER_CODE = 'PROMOTE_EXISTING_USER';

export async function createStaffUser(input: {
  email: string;
  tempPassword?: string;
  roleIds?: string[];
  /** Convert an existing non-staff account to staff instead of failing. */
  promoteExisting?: boolean;
}): Promise<RbacPerson> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ person: RbacPerson }>>('/api/v1/rbac/people/staff', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.person;
}

export function hasPermission(
  perms: MyRbacPermissions | null | undefined,
  key: string
): boolean {
  if (!perms) return false;
  if (perms.isSuperAdmin) return true;
  return perms.permissions.includes(key);
}
