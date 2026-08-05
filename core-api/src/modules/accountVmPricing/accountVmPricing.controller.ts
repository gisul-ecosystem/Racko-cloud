import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types';
import {
  accountVmPricingService,
  type AccountPricingContext,
} from './accountVmPricing.service';
import type { AccountVmPricingProvider, AccountVmPricingScopeType } from '../../models/accountVmPricingOverride.model';
import type { UpsertAccountVmPricingInput } from './accountVmPricing.service';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

function toContext(
  scopeType: AccountVmPricingScopeType,
  accountId: string
): AccountPricingContext {
  if (scopeType === 'organization') {
    return { scopeType: 'organization', orgId: accountId };
  }
  return { scopeType: 'tenant', tenantId: accountId };
}

export class AccountVmPricingController {
  searchAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopeType = req.query.scopeType as AccountVmPricingScopeType;
      const accounts = await accountVmPricingService.searchAccounts({
        scopeType,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      success(res, 'Accounts retrieved.', { accounts, total: accounts.length });
    } catch (err) {
      next(err);
    }
  };

  listOverrides = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = req.params.provider as AccountVmPricingProvider;
      const overrides = await accountVmPricingService.listOverrides(provider);
      success(res, 'Account pricing overrides retrieved.', {
        overrides,
        total: overrides.length,
      });
    } catch (err) {
      next(err);
    }
  };

  getOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = req.params.provider as AccountVmPricingProvider;
      const scopeType = req.params.scopeType as AccountVmPricingScopeType;
      const accountId = req.params.accountId as string;
      const override = await accountVmPricingService.getOverride(
        provider,
        toContext(scopeType, accountId)
      );
      success(res, 'Account pricing override retrieved.', { override });
    } catch (err) {
      next(err);
    }
  };

  upsertOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const provider = req.params.provider as AccountVmPricingProvider;
      const scopeType = req.params.scopeType as AccountVmPricingScopeType;
      const accountId = req.params.accountId as string;
      const override = await accountVmPricingService.upsertOverride(
        provider,
        toContext(scopeType, accountId),
        req.body as UpsertAccountVmPricingInput,
        authReq.user.userId
      );
      success(res, 'Account pricing override saved.', { override });
    } catch (err) {
      next(err);
    }
  };

  deleteOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = req.params.provider as AccountVmPricingProvider;
      const scopeType = req.params.scopeType as AccountVmPricingScopeType;
      const accountId = req.params.accountId as string;
      await accountVmPricingService.deleteOverride(provider, toContext(scopeType, accountId));
      success(res, 'Account pricing override removed (inherits global).', { deleted: true });
    } catch (err) {
      next(err);
    }
  };
}

export const accountVmPricingController = new AccountVmPricingController();
