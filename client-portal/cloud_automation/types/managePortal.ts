export interface ManagePortalRole {
  role: string;
  scope?: string | null;
}

export interface ManagePortalUser {
  id: number;
  username: string;
  azureUserId: string | null;
  status: string;
  expiryDate: string | null;
  roles: ManagePortalRole[];
}

export interface ManagePortalLoginResponse {
  success: boolean;
  requestId: number;
  customerEmail: string;
  resourceGroup: string | null;
  sessionToken: string;
  expiresAt: string;
  userId: number | null;
  admin?: {
    id: string;
    username: string;
    email: string;
  };
}

export interface ManagePortalUsersResponse {
  success: boolean;
  requestId: number;
  users: ManagePortalUser[];
}

export interface ManagePortalSession {
  sessionToken: string;
  requestId: number;
  customerEmail: string;
  resourceGroup: string | null;
  expiresAt: string;
  userId: number | null;
}

export interface ManagePortalMutationResponse {
  success: boolean;
  user: ManagePortalUser;
}

export interface ManagePortalConsoleLaunchResponse {
  success: boolean;
  requestId: number;
  userId: number;
  username: string;
  userPrincipalName: string;
  temporaryPassword: string;
  signInUrl: string;
  portalUrl: string;
  resourceGroup: string | null;
}

export type ManagePortalErrorKind =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_link'
  | 'invalid_credentials'
  | 'blocked_access'
  | 'session_expired'
  | 'network'
  | 'unknown';
