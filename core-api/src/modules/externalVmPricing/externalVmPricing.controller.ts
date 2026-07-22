import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import type { ExternalVmPricingProvider } from '../../models/externalVmPricingConfig.model';
import { externalVmPricingService } from './externalVmPricing.service';
import type { CategoryPricingOverride, ExternalVmPricingCategory } from '../../models/externalVmPricingConfig.model';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export class ExternalVmPricingController {
  async getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params as { provider: ExternalVmPricingProvider };
      const data = await externalVmPricingService.getByProvider(provider);
      success(res, 'External VM pricing config retrieved.', data);
    } catch (err) {
      next(err);
    }
  }

  async saveConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { provider } = req.params as { provider: ExternalVmPricingProvider };
      const { categories, hourlyEnabled } = req.body as {
        categories: Record<ExternalVmPricingCategory, CategoryPricingOverride>;
        hourlyEnabled?: boolean;
      };
      const data = await externalVmPricingService.saveByProvider(
        provider,
        categories,
        authReq.user.userId,
        hourlyEnabled !== undefined ? { hourlyEnabled } : undefined
      );
      success(res, 'External VM pricing config saved.', data);
    } catch (err) {
      next(err);
    }
  }
}

export const externalVmPricingController = new ExternalVmPricingController();
