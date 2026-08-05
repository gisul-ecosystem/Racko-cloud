import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';
import { allowedOrigins, config } from '../config';

interface RequestContext {
  /** Origin of the portal the request came from, e.g. http://localhost:3000. */
  appBaseUrl: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/**
 * Origins that email links may point at. An attacker-controlled Host/Origin
 * header must never end up in a verification or reset link, so the incoming
 * origin is only honoured when it appears here.
 */
export const emailLinkOrigins: string[] = Array.from(
  new Set(
    [
      config.FRONTEND_URL,
      ...allowedOrigins,
      ...(config.NODE_ENV === 'development'
        ? ['http://localhost:3000', 'http://localhost:3001']
        : []),
    ]
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null)
  )
);

/** Canonical fallback when the caller's origin is unknown or not allowlisted. */
export const defaultAppBaseUrl: string =
  normalizeOrigin(config.FRONTEND_URL) ?? config.FRONTEND_URL.replace(/\/$/, '');

/**
 * Portal origin for the current request: the browser's Origin header when it is
 * allowlisted, otherwise the configured FRONTEND_URL. Keeps emailed links on the
 * host the user is actually using (localhost, LAN IP, dev.racko.ai, ...).
 */
export function resolveAppBaseUrl(req: Request): string {
  const candidates = [req.headers.origin, req.headers.referer];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const origin = normalizeOrigin(candidate);
    if (origin && emailLinkOrigins.includes(origin)) return origin;
  }

  return defaultAppBaseUrl;
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Portal origin for the in-flight request; falls back outside a request (cron, scripts). */
export function getAppBaseUrl(): string {
  return storage.getStore()?.appBaseUrl ?? defaultAppBaseUrl;
}
