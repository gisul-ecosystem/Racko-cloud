import type { Request, Response, NextFunction } from 'express';
import { z, type ZodTypeAny, ZodError, type ZodIssue } from 'zod';

function formatPublicValidationIssue(issue: ZodIssue): string {
  const field = issue.path.filter((part) => part !== 'body').join('.') || 'body';
  return `${field}: ${issue.message}`;
}

export function publicValidateRequest<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const description = (result.error as ZodError).issues
        .map(formatPublicValidationIssue)
        .join('; ');
      res.status(400).json({
        error: 'invalid_request',
        error_description: description || 'Validation failed.',
      });
      return;
    }

    if (result.data.body !== undefined) req.body = result.data.body;
    if (result.data.params !== undefined) req.params = result.data.params as Record<string, string>;
    if (result.data.query !== undefined) req.query = result.data.query as Record<string, string>;

    next();
  };
}

/** Re-export z for route-local schemas. */
export { z };
