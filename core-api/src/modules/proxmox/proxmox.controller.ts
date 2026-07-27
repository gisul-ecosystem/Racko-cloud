import type { Request, Response, NextFunction } from 'express';
import { proxmoxService } from './proxmox.service';
import { logger } from '../../utils/logger';
import type { AuthenticatedRequest } from '../../types';
import type { VMQueryParams } from './proxmox.validation';

// Consistent response shape — matches existing auth/user modules
function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class ProxmoxController {
  /**
   * GET /api/v1/proxmox/overview
   * Lightweight summary for dashboard header/stats cards.
   */
  async getClusterOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      logger.info('Proxmox cluster overview requested', {
        userId: authReq.user.userId,
        role: authReq.user.role,
        requestedAt: new Date().toISOString(),
      });

      const overview = await proxmoxService.getClusterOverview();
      success(res, 'Cluster overview retrieved.', { overview });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/proxmox/cluster
   * Full dashboard data: nodes + storage + VMs + overview.
   */
  async getFullClusterData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      logger.info('Proxmox full cluster data requested', {
        userId: authReq.user.userId,
        role: authReq.user.role,
        requestedAt: new Date().toISOString(),
      });

      const clusterData = await proxmoxService.getFullClusterData();
      success(res, 'Full cluster data retrieved.', clusterData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/proxmox/nodes
   * All nodes with resource usage (transformed).
   */
  async getNodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      logger.info('Proxmox nodes list requested', {
        userId: authReq.user.userId,
        requestedAt: new Date().toISOString(),
      });

      // getFullClusterData fetches versions too — for nodes-only, use service directly
      const rawNodes = await proxmoxService.getNodes();
      success(res, 'Nodes retrieved.', { nodes: rawNodes });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/proxmox/nodes/:nodeName
   * Detailed view of a specific node.
   */
  async getNodeDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { nodeName } = req.params as { nodeName: string };

      logger.info('Proxmox node details requested', {
        userId: authReq.user.userId,
        nodeName,
        requestedAt: new Date().toISOString(),
      });

      const node = await proxmoxService.getNodeStatus(nodeName);
      success(res, `Node '${nodeName}' retrieved.`, { node });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/proxmox/storage
   * All storage pools across all nodes (transformed).
   */
  async getAllStorage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      logger.info('Proxmox storage list requested', {
        userId: authReq.user.userId,
        requestedAt: new Date().toISOString(),
      });

      const storage = await proxmoxService.getAllStorage();
      success(res, 'Storage pools retrieved.', { storage });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/proxmox/vms
   * All VMs and containers across all nodes.
   * Supports optional query filters: ?node=&status=&type=
   */
  async getAllVMs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = req.query as VMQueryParams;

      logger.info('Proxmox VMs list requested', {
        userId: authReq.user.userId,
        filters: query,
        requestedAt: new Date().toISOString(),
      });

      let vms = await proxmoxService.getAllVMs();

      // Apply optional filters (validated by Zod before reaching here)
      if (query.node !== undefined) {
        vms = vms.filter((vm) => vm.node === query.node);
      }
      if (query.status !== undefined) {
        vms = vms.filter((vm) => vm.status === query.status);
      }
      if (query.type !== undefined) {
        vms = vms.filter((vm) => vm.type === query.type);
      }

      success(res, 'VMs retrieved.', { vms, total: vms.length });
    } catch (error) {
      next(error);
    }
  }
}

export const proxmoxController = new ProxmoxController();
