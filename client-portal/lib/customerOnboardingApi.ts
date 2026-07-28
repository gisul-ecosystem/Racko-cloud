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

export async function submitOrganizationRequest(input: {
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
    status: 'approved' | 'rejected' | 'more_info_required';
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
