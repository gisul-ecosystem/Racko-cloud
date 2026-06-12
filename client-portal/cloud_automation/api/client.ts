import { apiRequest } from '../../lib/apiClient';
import { CLOUD_AUTOMATION_API_PREFIX } from '../constants';
import type { CloudAutomationHealth } from '../types';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

function cloudAutomationPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${CLOUD_AUTOMATION_API_PREFIX}${normalized}`;
}

/** Health check for cloud_automation via the gateway. */
export async function fetchCloudAutomationHealth(): Promise<CloudAutomationHealth> {
  return apiRequest<CloudAutomationHealth>(cloudAutomationPath('/health'));
}

export { cloudAutomationPath };
