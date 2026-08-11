import { tenantPortalRequest } from './tenantPortalApiClient';
import type { AdminServiceKey } from './adminServicesApi';
import type {
  OrgProject,
  ProjectNamePreview,
  ProjectReportByProjectRow,
  ProjectReportByServiceRow,
} from './projectsApi';

export type { OrgProject, ProjectNamePreview, ProjectReportByProjectRow, ProjectReportByServiceRow };
export { PROJECT_SERVICE_LABELS } from './projectsApi';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

const BASE = '/api/v1/tenant-projects';

export async function fetchTenantProjects(): Promise<OrgProject[]> {
  const data = await unwrap<{ projects: OrgProject[]; total: number }>(
    tenantPortalRequest(`${BASE}`)
  );
  return data.projects;
}

export async function fetchTenantProjectsForService(
  serviceKey: AdminServiceKey
): Promise<OrgProject[]> {
  const data = await unwrap<{ projects: OrgProject[]; total: number }>(
    tenantPortalRequest(`${BASE}/for-service/${serviceKey}`)
  );
  return data.projects;
}

export async function fetchTenantProject(id: string): Promise<OrgProject> {
  const data = await unwrap<{ project: OrgProject }>(
    tenantPortalRequest(`${BASE}/${id}`)
  );
  return data.project;
}

export async function previewTenantProjectName(): Promise<ProjectNamePreview> {
  return unwrap(tenantPortalRequest(`${BASE}/name-preview`));
}

export async function fetchTenantEligibleProjectServices(): Promise<AdminServiceKey[]> {
  const data = await unwrap<{ services: AdminServiceKey[] }>(
    tenantPortalRequest(`${BASE}/eligible-services`)
  );
  return data.services;
}

export async function createTenantProject(input: {
  clientName: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  enabledServices: AdminServiceKey[];
}): Promise<OrgProject> {
  const data = await unwrap<{ project: OrgProject }>(
    tenantPortalRequest(`${BASE}`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  return data.project;
}

export async function updateTenantProject(
  id: string,
  input: { name?: string; clientName?: string; description?: string | null }
): Promise<OrgProject> {
  const data = await unwrap<{ project: OrgProject }>(
    tenantPortalRequest(`${BASE}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  );
  return data.project;
}

export async function addTenantProjectServices(
  id: string,
  services: AdminServiceKey[]
): Promise<OrgProject> {
  const data = await unwrap<{ project: OrgProject }>(
    tenantPortalRequest(`${BASE}/${id}/services`, {
      method: 'POST',
      body: JSON.stringify({ services }),
    })
  );
  return data.project;
}

export async function removeTenantProjectService(
  id: string,
  serviceKey: AdminServiceKey
): Promise<OrgProject> {
  const data = await unwrap<{ project: OrgProject }>(
    tenantPortalRequest(`${BASE}/${id}/services/${serviceKey}`, {
      method: 'DELETE',
    })
  );
  return data.project;
}

export async function archiveTenantProject(id: string): Promise<OrgProject> {
  const data = await unwrap<{ project: OrgProject }>(
    tenantPortalRequest(`${BASE}/${id}/archive`, { method: 'POST' })
  );
  return data.project;
}

export async function fetchTenantProjectCostReport(): Promise<ProjectReportByProjectRow[]> {
  const data = await unwrap<{ rows: ProjectReportByProjectRow[] }>(
    tenantPortalRequest(`${BASE}/reports/by-project`)
  );
  return data.rows;
}

export async function fetchTenantServiceCostReport(
  projectId?: string
): Promise<ProjectReportByServiceRow[]> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const data = await unwrap<{ rows: ProjectReportByServiceRow[] }>(
    tenantPortalRequest(`${BASE}/reports/by-service${qs}`)
  );
  return data.rows;
}
