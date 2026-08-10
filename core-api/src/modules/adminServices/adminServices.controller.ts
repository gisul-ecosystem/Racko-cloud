import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
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
    const services = await adminServicesService.catalog();
    success(res, 'Admin service catalog retrieved.', { services });
  } catch (err) {
    next(err);
  }
}

async function listForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = parseAdminObjectId(req.params['adminId'] as string);
    const [services, catalog] = await Promise.all([
      adminServicesService.listForAdmin(adminId),
      adminServicesService.catalog(),
    ]);
    success(res, 'Admin services retrieved.', {
      services,
      catalog,
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
    const serviceKey = req.params['serviceKey'] as string;
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
    const serviceKey = req.params['serviceKey'] as string;
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
