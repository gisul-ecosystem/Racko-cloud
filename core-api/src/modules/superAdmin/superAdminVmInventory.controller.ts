import type { NextFunction, Request, Response } from 'express';
import {
  superAdminVmInventoryService,
  type SuperAdminVmInventoryFilters,
} from './superAdminVmInventory.service';
import type { AuthenticatedRequest } from '../../types';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class SuperAdminVmInventoryController {
  async importProviderMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = req.body as {
        rows: Array<{
          ipAddress: string;
          planDuration?: 'monthly' | 'quarterly' | 'hourly' | 'yearly';
          username?: string;
          password?: string;
          providerStartDate?: string;
          providerEndDate?: string;
        }>;
      };

      const result = await superAdminVmInventoryService.importProviderMetadata(
        body.rows,
        authReq.user.userId
      );

      success(res, 'Provider metadata imported.', result, 201);
    } catch (error) {
      next(error);
    }
  }

  async listOwners(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as {
        resourceType?: SuperAdminVmInventoryFilters['resourceType'];
        originServiceKey?: SuperAdminVmInventoryFilters['originServiceKey'];
        ownerScope?: SuperAdminVmInventoryFilters['ownerScope'];
        tenantId?: string;
        adminId?: string;
        projectId?: string;
        status?: SuperAdminVmInventoryFilters['status'];
        search?: string;
        sortBy?: SuperAdminVmInventoryFilters['sortBy'];
        sortDirection?: SuperAdminVmInventoryFilters['sortDirection'];
        createdFrom?: string;
        createdTo?: string;
      };

      const owners = await superAdminVmInventoryService.listOwners({
        resourceType: query.resourceType,
        originServiceKey: query.originServiceKey,
        ownerScope: query.ownerScope,
        tenantId: query.tenantId,
        adminId: query.adminId,
        projectId: query.projectId,
        status: query.status,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        createdFrom: query.createdFrom,
        createdTo: query.createdTo,
      });

      success(res, 'Super admin VM inventory owners retrieved.', { owners });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as {
        resourceType?: SuperAdminVmInventoryFilters['resourceType'];
        originServiceKey?: SuperAdminVmInventoryFilters['originServiceKey'];
        ownerScope?: SuperAdminVmInventoryFilters['ownerScope'];
        tenantId?: string;
        adminId?: string;
        projectId?: string;
        status?: SuperAdminVmInventoryFilters['status'];
        search?: string;
        ownerSearch?: string;
        sortBy?: SuperAdminVmInventoryFilters['sortBy'];
        sortDirection?: SuperAdminVmInventoryFilters['sortDirection'];
        page?: string;
        limit?: string;
        createdFrom?: string;
        createdTo?: string;
      };

      const result = await superAdminVmInventoryService.listInventory({
        resourceType: query.resourceType,
        originServiceKey: query.originServiceKey,
        ownerScope: query.ownerScope,
        tenantId: query.tenantId,
        adminId: query.adminId,
        projectId: query.projectId,
        status: query.status,
        search: query.search,
        ownerSearch: query.ownerSearch,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        createdFrom: query.createdFrom,
        createdTo: query.createdTo,
      });

      success(res, 'Super admin VM inventory retrieved.', result);
    } catch (error) {
      next(error);
    }
  }
}

export const superAdminVmInventoryController = new SuperAdminVmInventoryController();
