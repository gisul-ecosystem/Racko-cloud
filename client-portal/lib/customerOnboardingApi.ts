import { apiRequest } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export interface OrganizationAccessRequest {
  _id: string;
  orgId?: string;
  userId:
    | string
    | {
        _id: string;
        email: string;
        accountType: string;
        onboardingStatus: string;
        isEmailVerified: boolean;
      };
  contactName: string;
  companyName: string;
  companyWebsite?: string;
  phone?: string;
  designation?: string;
  companySize?: string;
  registeredAddress?: string;
  taxId?: string;
  useCase?: string;
  expectedUsage?: string;
  status: 'pending' | 'approved' | 'rejected' | 'more_info_required';
  ndaStatus: 'not_started' | 'pending' | 'completed';
  reviewerNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMyOnboardingRequest(): Promise<OrganizationAccessRequest | null> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ request: OrganizationAccessRequest | null }>>(
      '/api/v1/customer-onboarding/me'
    )
  );
  return data.request;
}

export async function saveOrganizationProfile(input: {
  contactName: string;
  companyName: string;
  companyWebsite?: string;
  phone: string;
  officeNumber?: string;
  designation: string;
  companySize: string;
  registeredAddress: string;
  taxId: string;
  useCase: string;
  expectedUsage: string;
}): Promise<OrganizationAccessRequest> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ request: OrganizationAccessRequest }>>(
      '/api/v1/customer-onboarding/me/organization',
      { method: 'PUT', body: JSON.stringify(input) }
    )
  );
  return data.request;
}

export async function submitOrganizationRequest(input: {
  contactName: string;
  companyName: string;
  companyWebsite?: string;
  phone: string;
  officeNumber?: string;
  designation: string;
  companySize: string;
  registeredAddress: string;
  taxId: string;
  useCase: string;
  expectedUsage: string;
}): Promise<OrganizationAccessRequest> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ request: OrganizationAccessRequest }>>(
      '/api/v1/customer-onboarding/organization-request',
      { method: 'POST', body: JSON.stringify(input) }
    )
  );
  return data.request;
}

export async function fetchOrganizationRequests(): Promise<OrganizationAccessRequest[]> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ requests: OrganizationAccessRequest[]; total: number }>>(
      '/api/v1/customer-onboarding/organization-requests'
    )
  );
  return data.requests;
}

export async function reviewOrganizationRequest(
  id: string,
  input: {
    status: 'approved' | 'rejected';
    ndaStatus?: 'not_started' | 'pending' | 'completed';
    reviewerNotes?: string;
  }
): Promise<OrganizationAccessRequest> {
  const data = await unwrap(
    apiRequest<ApiEnvelope<{ request: OrganizationAccessRequest }>>(
      `/api/v1/customer-onboarding/organization-requests/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    )
  );
  return data.request;
}

export type AdminCreateOrganizationInput = {
  email: string;
  sendInvite?: boolean;
  /** Unlock console without collecting org details. */
  skipOrgOnboarding?: boolean;
  organization?: {
    contactName: string;
    companyName: string;
    companyWebsite?: string;
    phone: string;
    officeNumber?: string;
    designation: string;
    companySize: string;
    registeredAddress: string;
    taxId: string;
    useCase: string;
    expectedUsage: string;
  };
};

export type AdminCreateOrganizationResult = {
  user: {
    id: string;
    email: string;
    accountType: string;
    onboardingStatus: string;
    isEmailVerified: boolean;
    isActive: boolean;
  };
  organizationRequest: OrganizationAccessRequest | null;
  inviteSent: boolean;
};

export async function adminCreateOrganization(
  input: AdminCreateOrganizationInput
): Promise<AdminCreateOrganizationResult> {
  return unwrap(
    apiRequest<ApiEnvelope<AdminCreateOrganizationResult>>(
      '/api/v1/customer-onboarding/admin/organizations',
      { method: 'POST', body: JSON.stringify(input) }
    )
  );
}

export async function adminSendOrganizationInvite(
  userId: string
): Promise<{ userId: string; email: string; inviteSent: boolean }> {
  return unwrap(
    apiRequest<ApiEnvelope<{ userId: string; email: string; inviteSent: boolean }>>(
      `/api/v1/customer-onboarding/admin/organizations/${userId}/send-invite`,
      { method: 'POST', body: JSON.stringify({}) }
    )
  );
}

export async function adminDeleteOrganization(
  userId: string
): Promise<{ email: string; deleted: Record<string, number> }> {
  return unwrap(
    apiRequest<ApiEnvelope<{ email: string; deleted: Record<string, number> }>>(
      `/api/v1/customer-onboarding/admin/organizations/${userId}`,
      { method: 'DELETE' }
    )
  );
}
