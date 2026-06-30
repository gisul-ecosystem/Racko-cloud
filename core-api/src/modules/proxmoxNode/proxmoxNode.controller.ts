import type { Request, Response, NextFunction } from 'express';
import { proxmoxNodeService } from './proxmoxNode.service';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class ProxmoxNodeController {
  async getAvailable(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const nodes = await proxmoxNodeService.getAvailableNodes();
      success(res, 'Nodes retrieved.', { nodes });
    } catch (err) { next(err); }
  }

  async saveSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { selectedNames } = req.body as { selectedNames: string[] };
      await proxmoxNodeService.saveSelection(selectedNames ?? []);
      success(res, 'Node selection saved.');
    } catch (err) { next(err); }
  }
}

export const proxmoxNodeController = new ProxmoxNodeController();
