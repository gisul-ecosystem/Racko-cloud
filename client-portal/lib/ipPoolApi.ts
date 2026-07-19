import { apiRequest } from './apiClient';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface IpPoolStats {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
}

export interface IpRecord {
  _id: string;
  ip: string;
  status: 'available' | 'assigned' | 'reserved';
  vmId?: string;
  vmName?: string | null;
  reservedAt?: string;
  assignedAt?: string;
}

export interface IpListResponse {
  ips: IpRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AddSubnetResult {
  cidr: string;
  totalGenerated: number;
  excluded: number;
  inserted: number;
  alreadyExisted: number;
}

export async function fetchIpPoolStats(): Promise<IpPoolStats> {
  const res = await apiRequest<ApiResponse<IpPoolStats>>('/api/v1/ip-pool/stats');
  return res.data;
}

export async function fetchIpList(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<IpListResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  const res = await apiRequest<ApiResponse<IpListResponse>>(
    `/api/v1/ip-pool/list?${qs.toString()}`
  );
  return res.data;
}

export async function addSubnet(payload: {
  cidr: string;
  gateway: string;
  excludedIps: string[];
}): Promise<AddSubnetResult> {
  const res = await apiRequest<ApiResponse<AddSubnetResult>>('/api/v1/ip-pool/subnet', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function releaseIp(ip: string): Promise<void> {
  // Encode dots in the IP so Express doesn't misparse the route param
  await apiRequest<ApiResponse<{ ip: string }>>(
    `/api/v1/ip-pool/${encodeURIComponent(ip)}/release`,
    { method: 'POST' }
  );
}
