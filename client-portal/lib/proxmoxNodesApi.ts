import { apiRequest } from './apiClient';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ProxmoxNodeOption {
  name: string;
  status: string;
  isSelected: boolean;
}

export async function fetchAvailableNodes(): Promise<ProxmoxNodeOption[]> {
  const res = await apiRequest<ApiResponse<{ nodes: ProxmoxNodeOption[] }>>(
    '/api/v1/proxmox-nodes/available'
  );
  return res.data.nodes;
}

export async function saveNodeSelection(selectedNames: string[]): Promise<void> {
  await apiRequest<ApiResponse<null>>('/api/v1/proxmox-nodes/selection', {
    method: 'POST',
    body: JSON.stringify({ selectedNames }),
  });
}
