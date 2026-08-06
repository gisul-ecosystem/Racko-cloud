import type { Request, Response, NextFunction } from 'express';
import { Tenant } from '../../models/tenant.model';

function toPublicTenant(tenant: {
  _id: { toString(): string };
  slug: string;
  status: string;
  domain: string;
  ipAccessMode?: string;
  allowedIps?: string[];
}) {
  return {
    id: tenant._id.toString(),
    slug: tenant.slug,
    status: tenant.status,
    domain: tenant.domain,
    ipAccessMode: tenant.ipAccessMode ?? 'all',
    allowedIps: tenant.allowedIps ?? [],
  };
}

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

      res.status(200).json(toPublicTenant(tenant));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params['id'] || '').trim();
      if (!id) {
        res.status(400).json({ message: 'INVALID_TENANT_ID' });
        return;
      }

      const tenant = await Tenant.findById(id).lean();
      if (!tenant) {
        res.status(404).json({ message: 'TENANT_NOT_FOUND' });
        return;
      }

      res.status(200).json(toPublicTenant(tenant));
    } catch (error) {
      next(error);
    }
  }
}

export const internalTenantController = new InternalTenantController();
