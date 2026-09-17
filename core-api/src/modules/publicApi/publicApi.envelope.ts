import type { Response } from 'express';

/** Stable public API version string (date-based). */
export const PUBLIC_API_VERSION = '2026-03-11';

/**
 * Success envelope for /api/v1/public/* — one contract for tenant and platform callers.
 *
 * ```json
 * { "api_version": "2026-03-11", "data": { ... } }
 * ```
 */
export function sendPublicSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    api_version: PUBLIC_API_VERSION,
    data,
  });
}
