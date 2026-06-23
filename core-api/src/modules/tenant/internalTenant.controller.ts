import type { Request, Response, NextFunction } from 'express';
import { Tenant } from '../../models/tenant.model';

export class InternalTenantController {
  async resolveByHost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { host } = req.body as { host?: string };

      if (!host || typeof host !== 'string') {
        res.status(400).json({ message: 'INVALID_HOST' });
        return;
      }

      const normalizedHost = host.toLowerCase().trim();
      const tenant = await Tenant.findOne({ domain: normalizedHost, status: 'active' }).lean();

      if (!tenant) {
        res.status(404).json({ message: 'TENANT_NOT_FOUND' });
        return;
      }

      res.status(200).json({
        id: tenant._id.toString(),
        slug: tenant.slug,
        status: tenant.status,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const internalTenantController = new InternalTenantController();
