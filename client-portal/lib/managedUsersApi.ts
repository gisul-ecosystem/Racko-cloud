import { apiRequest } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManagedUserProfile {
  id: string;
  email: string;
  role: 'user';
  isActive: boolean;
  createdAt: string;
}

export interface BulkCreateResult {
  created: number;
  failed: number;
  users: Array<{
    email: string;
    password: string;
    status: 'created' | 'failed';
    error?: string;
  }>;
}

export interface CreateSingleUserDto {
  email: string;
  password: string;
}

export interface CreateBulkUsersDto {
  emailPrefix: string;
  count: number;
  password?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function createSingleUser(dto: CreateSingleUserDto): Promise<ManagedUserProfile> {
  const res = await apiRequest<ApiResponse<{ user: ManagedUserProfile }>>(
    '/api/v1/managed-users/single',
    { method: 'POST', body: JSON.stringify(dto) }
  );
  return res.data.user;
}

export async function createBulkUsers(dto: CreateBulkUsersDto): Promise<BulkCreateResult> {
  const res = await apiRequest<ApiResponse<BulkCreateResult>>(
    '/api/v1/managed-users/bulk',
    { method: 'POST', body: JSON.stringify(dto) }
  );
  return res.data;
}

export async function fetchMyUsers(): Promise<ManagedUserProfile[]> {
  const res = await apiRequest<ApiResponse<{ users: ManagedUserProfile[]; total: number }>>(
    '/api/v1/managed-users'
  );
  return res.data.users;
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ManagedUserProfile> {
  const res = await apiRequest<ApiResponse<{ user: ManagedUserProfile }>>(
    `/api/v1/managed-users/${userId}/active`,
    { method: 'PATCH', body: JSON.stringify({ isActive }) }
  );
  return res.data.user;
}

export async function deleteUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/managed-users/${userId}`, { method: 'DELETE' });
}
