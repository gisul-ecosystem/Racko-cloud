import type { Request, Response, NextFunction } from 'express';
import type { TenantAuthenticatedRequest } from '../../middleware/requireTenantAuth.middleware';
import { isAdminServiceKey } from '../../constants/adminServiceCatalog';
import { ValidationError } from '../../utils/errors';
import { projectsService } from '../projects/projects.service';
import type {
  AddProjectServicesInput,
  CreateProjectInput,
  UpdateProjectInput,
} from '../projects/projects.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

function tenantAuth(req: Request): TenantAuthenticatedRequest {
  return req as TenantAuthenticatedRequest;
}

async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const projects = await projectsService.listForTenant(authReq.tenantUser.tenantId);
    success(res, 'Projects retrieved.', { projects, total: projects.length });
  } catch (err) {
    next(err);
  }
}

async function previewName(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const preview = await projectsService.previewNameForTenant(authReq.tenantUser.tenantId);
    success(res, 'Project name preview generated.', preview);
  } catch (err) {
    next(err);
  }
}

async function listEligibleServices(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const services = await projectsService.listEligibleServicesForTenant(
      authReq.tenantUser.tenantId
    );
    success(res, 'Eligible project services retrieved.', { services });
  } catch (err) {
    next(err);
  }
}

async function listForService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const serviceKey = String(req.params['serviceKey'] || '');
    if (!isAdminServiceKey(serviceKey)) {
      throw new ValidationError(`Unknown service "${serviceKey}".`);
    }
    const projects = await projectsService.listActiveForTenantService(
      authReq.tenantUser.tenantId,
      serviceKey
    );
    success(res, 'Projects retrieved.', { projects, total: projects.length });
  } catch (err) {
    next(err);
  }
}

async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const project = await projectsService.getByIdForTenant(
      authReq.tenantUser.tenantId,
      String(req.params['id'])
    );
    success(res, 'Project retrieved.', { project });
  } catch (err) {
    next(err);
  }
}

async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const project = await projectsService.createForTenantWorkspace(
      authReq.tenantUser.tenantId,
      authReq.tenantUser.id,
      req.body as CreateProjectInput
    );
    success(res, 'Project created.', { project }, 201);
  } catch (err) {
    next(err);
  }
}

async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const project = await projectsService.updateForTenant(
      authReq.tenantUser.tenantId,
      String(req.params['id']),
      req.body as UpdateProjectInput
    );
    success(res, 'Project updated.', { project });
  } catch (err) {
    next(err);
  }
}

async function addServices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const project = await projectsService.addServicesForTenant(
      authReq.tenantUser.tenantId,
      String(req.params['id']),
      req.body as AddProjectServicesInput
    );
    success(res, 'Services added to project.', { project });
  } catch (err) {
    next(err);
  }
}

async function removeService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const project = await projectsService.removeServiceForTenant(
      authReq.tenantUser.tenantId,
      String(req.params['id']),
      String(req.params['serviceKey'])
    );
    success(res, 'Service removed from project.', { project });
  } catch (err) {
    next(err);
  }
}

async function archive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const project = await projectsService.archiveForTenant(
      authReq.tenantUser.tenantId,
      String(req.params['id'])
    );
    success(res, 'Project archived.', { project });
  } catch (err) {
    next(err);
  }
}

async function reportByProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const rows = await projectsService.reportByProjectForTenant(authReq.tenantUser.tenantId);
    success(res, 'Project cost report retrieved.', { rows });
  } catch (err) {
    next(err);
  }
}

async function reportByService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = tenantAuth(req);
    const projectId =
      typeof req.query['projectId'] === 'string' ? req.query['projectId'] : undefined;
    const rows = await projectsService.reportByServiceForTenant(
      authReq.tenantUser.tenantId,
      projectId
    );
    success(res, 'Service cost report retrieved.', { rows });
  } catch (err) {
    next(err);
  }
}

export const tenantProjectsController = {
  list,
  previewName,
  listEligibleServices,
  listForService,
  getById,
  create,
  update,
  addServices,
  removeService,
  archive,
  reportByProject,
  reportByService,
};
