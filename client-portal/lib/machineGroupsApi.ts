import { apiRequest } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IMachineGroup {
  _id: string;
  name: string;
  adminId: string;
  machineIds: string[];
  machineCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function fetchGroups(): Promise<IMachineGroup[]> {
  const res = await apiRequest<ApiResponse<{ groups: IMachineGroup[] }>>('/api/v1/machine-groups');
  return res.data.groups;
}

export async function createGroup(name: string): Promise<IMachineGroup> {
  const res = await apiRequest<ApiResponse<{ group: IMachineGroup }>>('/api/v1/machine-groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return res.data.group;
}

export async function renameGroup(id: string, name: string): Promise<IMachineGroup> {
  const res = await apiRequest<ApiResponse<{ group: IMachineGroup }>>(`/api/v1/machine-groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return res.data.group;
}

export async function deleteGroup(id: string): Promise<void> {
  await apiRequest(`/api/v1/machine-groups/${id}`, { method: 'DELETE' });
}

// ─── Machine membership ───────────────────────────────────────────────────────

export async function addMachinesToGroup(id: string, machineIds: string[]): Promise<IMachineGroup> {
  const res = await apiRequest<ApiResponse<{ group: IMachineGroup }>>(`/api/v1/machine-groups/${id}/machines`, {
    method: 'POST',
    body: JSON.stringify({ machineIds }),
  });
  return res.data.group;
}

export async function removeMachinesFromGroup(id: string, machineIds: string[]): Promise<IMachineGroup> {
  const res = await apiRequest<ApiResponse<{ group: IMachineGroup }>>(`/api/v1/machine-groups/${id}/machines`, {
    method: 'DELETE',
    body: JSON.stringify({ machineIds }),
  });
  return res.data.group;
}

export async function fetchGroupMachines(id: string): Promise<{ _id: string; name: string; status: string; os: string; ipAddress: string }[]> {
  const res = await apiRequest<ApiResponse<{ machines: { _id: string; name: string; status: string; os: string; ipAddress: string }[] }>>(
    `/api/v1/machine-groups/${id}/machines`
  );
  return res.data.machines;
}
