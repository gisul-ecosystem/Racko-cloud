import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Zod request validation middleware.
 * Validates req.body, req.params, req.query against the provided schema.
 */
export function validateRequest<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((issue) => ({
        field: issue.path.slice(1).join('.'), // remove 'body'/'params'/'query' prefix
        message: issue.message,
      }));

      res.status(400).json({
        success: false,
        message: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        errors,
      });
      return;
    }

    // Merge validated data back into request
    if (result.data.body !== undefined) req.body = result.data.body;
    if (result.data.params !== undefined) req.params = result.data.params as Record<string, string>;
    if (result.data.query !== undefined) req.query = result.data.query as Record<string, string>;

    next();
  };
}
