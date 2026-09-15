import { TENANT_CONSOLE } from './tenantAdminRoutes';
import { openTenantUrlWithSession } from './tenantPortalApiClient';

/** True when the path is a full-page Guacamole viewer (not VM detail or /console hub). */
export function isGuacamoleConsolePagePath(path: string): boolean {
  if (path.includes('/docs/')) return false;
  if (path === '/console' || path === '/console/') return false;
  return /\/console\/?(?:\?.*)?$/.test(path);
}

/**
 * Open a Guacamole console route in a new browser tab.
 * Tenant routes carry session via `_s` (sessionStorage is not cloned reliably).
 */
export function openGuacamoleConsolePage(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (normalized.startsWith(TENANT_CONSOLE)) {
    openTenantUrlWithSession(normalized);
    return;
  }

  window.open(normalized, '_blank', 'noopener,noreferrer');
}

/**
 * Leave the console tab after server-side session kill.
 * Closes script-opened tabs; falls back to navigation if the browser blocks close.
 */
export function exitGuacamoleConsolePage(fallbackHref: string): void {
  if (typeof window === 'undefined') return;

  window.close();

  window.setTimeout(() => {
    if (typeof window.closed === 'boolean' && !window.closed) {
      window.location.assign(fallbackHref);
    }
  }, 150);
}
