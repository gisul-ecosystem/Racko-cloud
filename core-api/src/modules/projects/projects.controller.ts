import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import { isAdminServiceKey } from '../../constants/adminServiceCatalog';
import { ValidationError } from '../../utils/errors';
import { projectsService } from './projects.service';
import type {
  AddProjectServicesInput,
  CreateProjectInput,
  UpdateProjectInput,
} from './projects.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function previewName(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const preview = await projectsService.previewName(authReq.user.userId);
    success(res, 'Project name preview generated.', preview);
  } catch (err) {
    next(err);
  }
}

async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const projects = await projectsService.list(authReq.user.userId);
    success(res, 'Projects retrieved.', { projects, total: projects.length });
  } catch (err) {
    next(err);
  }
}

async function listForService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const serviceKey = String(req.params['serviceKey'] || '');
    if (!isAdminServiceKey(serviceKey)) {
      throw new ValidationError(`Unknown service "${serviceKey}".`);
    }
    const projects = await projectsService.listActiveForService(
      authReq.user.userId,
      serviceKey
    );
    success(res, 'Projects retrieved.', { projects, total: projects.length });
  } catch (err) {
    next(err);
  }
}

async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const project = await projectsService.getById(
      authReq.user.userId,
      String(req.params['id'])
    );
    success(res, 'Project retrieved.', { project });
  } catch (err) {
    next(err);
  }
}

async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateProjectInput;
    const project = await projectsService.create(authReq.user.userId, body);
    success(res, 'Project created.', { project }, 201);
  } catch (err) {
    next(err);
  }
}

async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as UpdateProjectInput;
    const project = await projectsService.update(
      authReq.user.userId,
      String(req.params['id']),
      body
    );
    success(res, 'Project updated.', { project });
  } catch (err) {
    next(err);
  }
}

async function addServices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as AddProjectServicesInput;
    const project = await projectsService.addServices(
      authReq.user.userId,
      String(req.params['id']),
      body
    );
    success(res, 'Services added to project.', { project });
  } catch (err) {
    next(err);
  }
}

async function removeService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const project = await projectsService.removeService(
      authReq.user.userId,
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
    const authReq = req as AuthenticatedRequest;
    const project = await projectsService.archive(
      authReq.user.userId,
      String(req.params['id'])
    );
    success(res, 'Project archived.', { project });
  } catch (err) {
    next(err);
  }
}

async function reportByProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const rows = await projectsService.reportByProject(authReq.user.userId);
    success(res, 'Project cost report retrieved.', { rows });
  } catch (err) {
    next(err);
  }
}

async function reportByService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const projectId =
      typeof req.query['projectId'] === 'string' ? req.query['projectId'] : undefined;
    const rows = await projectsService.reportByService(authReq.user.userId, projectId);
    success(res, 'Service cost report retrieved.', { rows });
  } catch (err) {
    next(err);
  }
}

async function listForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projects = await projectsService.listForAdmin(String(req.params['adminId']));
    success(res, 'Projects retrieved.', { projects, total: projects.length });
  } catch (err) {
    next(err);
  }
}

async function previewNameForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const preview = await projectsService.previewNameForAdmin(String(req.params['adminId']));
    success(res, 'Project name preview generated.', preview);
  } catch (err) {
    next(err);
  }
}

async function listEligibleServicesForAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const services = await projectsService.listEligibleServicesForAdmin(
      String(req.params['adminId'])
    );
    success(res, 'Eligible project services retrieved.', { services });
  } catch (err) {
    next(err);
  }
}

async function createForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateProjectInput;
    const project = await projectsService.createForAdmin(
      String(req.params['adminId']),
      authReq.user.userId,
      body
    );
    success(res, 'Project created.', { project }, 201);
  } catch (err) {
    next(err);
  }
}

async function addServicesForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as AddProjectServicesInput;
    const project = await projectsService.addServicesForAdmin(
      String(req.params['adminId']),
      String(req.params['projectId']),
      body
    );
    success(res, 'Services added to project.', { project });
  } catch (err) {
    next(err);
  }
}

async function getByIdForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await projectsService.getByIdForAdmin(
      String(req.params['adminId']),
      String(req.params['projectId'])
    );
    success(res, 'Project retrieved.', { project });
  } catch (err) {
    next(err);
  }
}

async function reportByServiceForAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await projectsService.reportByServiceForAdmin(
      String(req.params['adminId']),
      String(req.params['projectId'])
    );
    success(res, 'Service cost report retrieved.', { rows });
  } catch (err) {
    next(err);
  }
}

async function addServicesForTenantSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as AddProjectServicesInput;
    const project = await projectsService.addServicesForTenantBySuperAdmin(
      String(req.params['tenantId']),
      String(req.params['projectId']),
      body
    );
    success(res, 'Services added to project.', { project });
  } catch (err) {
    next(err);
  }
}

async function listForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const projects = await projectsService.listForTenantBySuperAdmin(
      String(req.params['tenantId'])
    );
    success(res, 'Projects retrieved.', { projects, total: projects.length });
  } catch (err) {
    next(err);
  }
}

async function previewNameForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const preview = await projectsService.previewNameForTenantBySuperAdmin(
      String(req.params['tenantId'])
    );
    success(res, 'Project name preview generated.', preview);
  } catch (err) {
    next(err);
  }
}

async function listEligibleServicesForTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const services = await projectsService.listEligibleServicesForTenantBySuperAdmin(
      String(req.params['tenantId'])
    );
    success(res, 'Eligible project services retrieved.', { services });
  } catch (err) {
    next(err);
  }
}

async function createForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateProjectInput;
    const project = await projectsService.createForTenantBySuperAdmin(
      String(req.params['tenantId']),
      authReq.user.userId,
      body
    );
    success(res, 'Project created.', { project }, 201);
  } catch (err) {
    next(err);
  }
}

async function updateForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as UpdateProjectInput;
    const project = await projectsService.updateForAdminBySuperAdmin(
      String(req.params['adminId']),
      String(req.params['projectId']),
      body
    );
    success(res, 'Project updated.', { project });
  } catch (err) {
    next(err);
  }
}

async function updateForTenantSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as UpdateProjectInput;
    const project = await projectsService.updateForTenant(
      String(req.params['tenantId']),
      String(req.params['projectId']),
      body
    );
    success(res, 'Project updated.', { project });
  } catch (err) {
    next(err);
  }
}

async function listClientNames(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const clientNames = await projectsService.distinctClientNames(authReq.user.userId);
    success(res, 'Client names retrieved.', { clientNames });
  } catch (err) {
    next(err);
  }
}

async function listClientNamesForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientNames = await projectsService.distinctClientNamesForTenant(String(req.params['tenantId']));
    success(res, 'Client names retrieved.', { clientNames });
  } catch (err) {
    next(err);
  }
}

export const projectsController = {
  previewName,
  list,
  listForService,
  getById,
  create,
  update,
  addServices,
  removeService,
  archive,
  reportByProject,
  reportByService,
  listClientNames,
  listClientNamesForTenant,
  listForAdmin,
  previewNameForAdmin,
  listEligibleServicesForAdmin,
  createForAdmin,
  updateForAdmin,
  addServicesForAdmin,
  getByIdForAdmin,
  reportByServiceForAdmin,
  listForTenant,
  previewNameForTenant,
  listEligibleServicesForTenant,
  createForTenant,
  updateForTenantSuperAdmin,
  addServicesForTenantSuperAdmin,
};
