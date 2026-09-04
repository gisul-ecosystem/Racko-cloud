export interface CreateSingleTenantUserDto {
  email: string;
  password: string;
}

export interface CreateBulkTenantUsersDto {
  emailPrefix: string;
  count: number;
  password?: string;
}

export interface TenantUserProfile {
  id: string;
  email: string;
  username: string | null;
  role: 'tenant_user';
  tenantId: string;
  isActive: boolean;
  createdAt: string;
}

export interface BulkCreateTenantUsersResult {
  created: number;
  failed: number;
  users: Array<{
    email: string;
    password: string;
    status: 'created' | 'failed';
    error?: string;
  }>;
}

export interface CreateOnboardTenantUserResult {
  email: string;
  password: string;
  status: 'created' | 'failed';
  userId?: string;
  error?: string;
}
