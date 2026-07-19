import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import {
  ADMIN_SERVICE_LABELS,
  type AdminServiceKey,
} from '../../constants/adminServiceCatalog';
import {
  adminServicesService,
  parseAdminObjectId,
} from './adminServices.service';
import type {
  AssignAdminServiceInput,
  UpdateAdminServiceInput,
} from './adminServices.validation';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = parseAdminObjectId(authReq.user.userId);
    const services = await adminServicesService.listMine(adminId);
    success(res, 'Admin services retrieved.', { services });
  } catch (err) {
    next(err);
  }
}

async function listCatalog(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const keys = adminServicesService.catalog();
    success(res, 'Admin service catalog retrieved.', {
      services: keys.map((serviceKey) => ({
        serviceKey,
        label: ADMIN_SERVICE_LABELS[serviceKey],
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function listForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = parseAdminObjectId(req.params['adminId'] as string);
    const services = await adminServicesService.listForAdmin(adminId);
    success(res, 'Admin services retrieved.', {
      services: services.map((s) => ({
        ...s,
        label: ADMIN_SERVICE_LABELS[s.serviceKey],
      })),
      catalog: adminServicesService.catalog().map((serviceKey) => ({
        serviceKey,
        label: ADMIN_SERVICE_LABELS[serviceKey],
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function assign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = parseAdminObjectId(req.params['adminId'] as string);
    const body = req.body as AssignAdminServiceInput;
    const actorId = parseAdminObjectId(authReq.user.userId);
    const service = await adminServicesService.assignService(
      adminId,
      body.serviceKey,
      actorId
    );
    success(res, 'Service assigned.', { service }, 201);
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = parseAdminObjectId(req.params['adminId'] as string);
    const serviceKey = req.params['serviceKey'] as AdminServiceKey;
    const body = req.body as UpdateAdminServiceInput;
    const service = await adminServicesService.updateStatus(adminId, serviceKey, body.status);
    success(res, 'Service status updated.', { service });
  } catch (err) {
    next(err);
  }
}

async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = parseAdminObjectId(req.params['adminId'] as string);
    const serviceKey = req.params['serviceKey'] as AdminServiceKey;
    await adminServicesService.removeService(adminId, serviceKey);
    success(res, 'Service removed.', { removed: true });
  } catch (err) {
    next(err);
  }
}

export const adminServicesController = {
  listMine,
  listCatalog,
  listForAdmin,
  assign,
  updateStatus,
  remove,
};
