import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { apiCredentialsService } from './apiCredentials.service';
import type { ApiCredentialActorRequest } from './requireApiCredentialActor.middleware';
import { ApiCredentialScopeError } from './apiCredentialScopes';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class ApiCredentialsController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { apiCredentialActor } = req as ApiCredentialActorRequest;
      const body = req.body as {
        name: string;
        scopes?: string[];
        rateLimitPerMin?: number | null;
      };
      const result = await apiCredentialsService.create(apiCredentialActor, body);
      success(
        res,
        'API credential created. Store the client secret securely — it will not be shown again.',
        result,
        201
      );
    } catch (err) {
      if (err instanceof ApiCredentialScopeError) {
        res.status(400).json({
          error: err.error,
          error_description: err.errorDescription,
        });
        return;
      }
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { apiCredentialActor } = req as ApiCredentialActorRequest;
      const credentials = await apiCredentialsService.list(apiCredentialActor);
      success(res, 'API credentials retrieved.', { credentials });
    } catch (err) {
      next(err);
    }
  }

  async usage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { apiCredentialActor } = req as ApiCredentialActorRequest;
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const usage = await apiCredentialsService.getUsage(apiCredentialActor, id);
      success(res, 'API credential usage retrieved.', { usage });
    } catch (err) {
      next(err);
    }
  }

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { apiCredentialActor } = req as ApiCredentialActorRequest;
      const id = new mongoose.Types.ObjectId(req.params['id'] as string);
      const credential = await apiCredentialsService.revoke(apiCredentialActor, id);
      success(res, 'API credential revoked.', { credential });
    } catch (err) {
      next(err);
    }
  }
}

export const apiCredentialsController = new ApiCredentialsController();
