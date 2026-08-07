import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { machineGroupsService } from './machine-groups.service';
import type { AuthenticatedRequest } from '../../types';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class MachineGroupsController {
  /** POST /api/v1/machine-groups */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const { name } = req.body as { name: string };
      const group = await machineGroupsService.create(name, adminId);
      success(res, 'Group created.', { group }, 201);
    } catch (err) { next(err); }
  }

  /** GET /api/v1/machine-groups */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const groups = await machineGroupsService.list(adminId);
      success(res, 'Groups retrieved.', { groups, total: groups.length });
    } catch (err) { next(err); }
  }

  /** GET /api/v1/machine-groups/:id */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const group = await machineGroupsService.getOne(id, adminId);
      success(res, 'Group retrieved.', { group });
    } catch (err) { next(err); }
  }

  /** PATCH /api/v1/machine-groups/:id — rename */
  async rename(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const { name } = req.body as { name: string };
      const group = await machineGroupsService.rename(id, name, adminId);
      success(res, 'Group renamed.', { group });
    } catch (err) { next(err); }
  }

  /** DELETE /api/v1/machine-groups/:id */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      await machineGroupsService.delete(id, adminId);
      success(res, 'Group deleted.');
    } catch (err) { next(err); }
  }

  /** POST /api/v1/machine-groups/:id/machines — add machines to group */
  async addMachines(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const { machineIds } = req.body as { machineIds: string[] };
      const group = await machineGroupsService.addMachines(id, machineIds, adminId);
      success(res, 'Machines added to group.', { group });
    } catch (err) { next(err); }
  }

  /** DELETE /api/v1/machine-groups/:id/machines — remove machines from group */
  async removeMachines(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const { machineIds } = req.body as { machineIds: string[] };
      const group = await machineGroupsService.removeMachines(id, machineIds, adminId);
      success(res, 'Machines removed from group.', { group });
    } catch (err) { next(err); }
  }

  /** GET /api/v1/machine-groups/:id/machines — list machines in group */
  async listMachines(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const machines = await machineGroupsService.listMachines(id, adminId);
      success(res, 'Machines retrieved.', { machines, total: machines.length });
    } catch (err) { next(err); }
  }
}

export const machineGroupsController = new MachineGroupsController();
