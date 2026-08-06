import { apiRequest } from '@/lib/apiClient';
import { CLOUD_AUTOMATION_TRAINING_API_PREFIX, type LabTemplate } from '../constants';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

export async function listLabTemplates(): Promise<LabTemplate[]> {
  const response = await apiRequest<ApiResponse<{ labs: LabTemplate[] }>>(
    `${CLOUD_AUTOMATION_TRAINING_API_PREFIX}/lab-templates`
  );
  return response.data?.labs ?? [];
}

export async function getLabTemplate(id: string): Promise<LabTemplate | null> {
  const response = await apiRequest<ApiResponse<{ lab: LabTemplate }>>(
    `${CLOUD_AUTOMATION_TRAINING_API_PREFIX}/lab-templates/${id}`
  );
  return response.data?.lab ?? null;
}

export async function createLabEnrollment(payload: {
  templateId: string;
  learnerEmail: string;
  accountCount: number;
  selectedInstances: string[];
  projectName?: string;
  startDate?: string;
  endDate?: string;
  azureRequestId?: number;
}): Promise<{
  enrollmentId: string;
  status: string;
  lab: LabTemplate;
  azureRequestId?: number | null;
}> {
  const response = await apiRequest<
    ApiResponse<{
      enrollment: {
        enrollmentId: string;
        status: string;
        lab: LabTemplate;
      };
    }>
  >(`${CLOUD_AUTOMATION_TRAINING_API_PREFIX}/enrollments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.data?.enrollment) {
    throw new Error(response.message || 'Failed to create lab enrollment.');
  }

  return response.data.enrollment;
}
