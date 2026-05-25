export interface CreateSingleUserDto {
  email: string;
  password: string;
}

export interface CreateBulkUsersDto {
  emailPrefix: string;   // e.g. "vmwareuser@gmail.com" → vmwareuser1@gmail.com, vmwareuser2@gmail.com
  count: number;         // 1–100
  password?: string;     // if provided, all users get this password; if omitted, auto-generate
}

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
    password: string;  // plain text — returned once only, never stored
    status: 'created' | 'failed';
    error?: string;
  }>;
}
