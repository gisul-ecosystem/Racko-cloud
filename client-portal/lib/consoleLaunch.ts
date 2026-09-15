import { TENANT_CONSOLE, tenantConsole } from './tenantAdminRoutes';
import { isTenantWorkspacePath } from './portalMode';
import { openTenantUrlWithSession } from './tenantPortalApiClient';

/** Message type sent from console tab to parent tab on disconnect. */
export const CONSOLE_DISCONNECTED_MSG = 'RACKO_CONSOLE_DISCONNECTED';

/** True when the path is a full-page Guacamole viewer (not VM detail or /console hub). */
export function isGuacamoleConsolePagePath(path: string): boolean {
  if (path.includes('/docs/')) return false;
  if (path === '/console' || path === '/console/') return false;
  return /\/console\/?(?:\?.*)?$/.test(path);
}

/** Map org-admin console URLs to tenant dashboard mirrors when opened from tenant workspace. */
function resolveTenantConsolePath(path: string): string {
  const [pathname, search = ''] = path.split('?');
  const qs = search ? `?${search}` : '';

  if (pathname.startsWith(TENANT_CONSOLE)) {
    return path;
  }

  const elastic = pathname.match(/^\/console\/elastic-servers\/([^/]+)\/console\/?$/);
  if (elastic) {
    return `${tenantConsole.elastic}/${elastic[1]}/console${qs}`;
  }

  const dedicated = pathname.match(/^\/console\/dedicated-server\/my-servers\/([^/]+)\/console\/?$/);
  if (dedicated) {
    return `${tenantConsole.dedicatedServerConsole(dedicated[1])}${qs}`;
  }

  const catalog = pathname.match(/^\/console\/create-vm\/my-vms\/([^/]+)\/console\/?$/);
  if (catalog) {
    return `${tenantConsole.createVmConsole(catalog[1])}${qs}`;
  }

  const platformVm = pathname.match(/^\/dashboard\/admin\/vms\/([^/]+)\/console\/?$/);
  if (platformVm) {
    return `${TENANT_CONSOLE}/admin/vms/${platformVm[1]}/console${qs}`;
  }

  const platformVmConsole = pathname.match(/^\/dashboard\/user\/vms\/([^/]+)\/console\/?$/);
  if (platformVmConsole) {
    return `${TENANT_CONSOLE}/admin/vms/${platformVmConsole[1]}/console${qs}`;
  }

  return path;
}

/**
 * Open a Guacamole console route in a new browser tab.
 * Tenant routes carry session via `_h` / `_s` (sessionStorage is not cloned reliably).
 */
export function openGuacamoleConsolePage(path: string): void {
  if (typeof window === 'undefined') return;
  let normalized = path.startsWith('/') ? path : `/${path}`;

  const openedFromTenant = isTenantWorkspacePath(window.location.pathname);
  if (openedFromTenant) {
    normalized = resolveTenantConsolePath(normalized);
  }

  if (normalized.startsWith(TENANT_CONSOLE) || (openedFromTenant && isTenantWorkspacePath(normalized))) {
    openTenantUrlWithSession(normalized);
    return;
  }

  window.open(normalized, '_blank', 'noopener,noreferrer');
}

/**
 * Leave the console tab after server-side session kill.
 *
 * Industry-standard multi-tab disconnect pattern:
 * 1. Notify the opener (parent tab) via postMessage so IT can navigate.
 *    The parent already has a valid session — no need to re-authenticate.
 * 2. Try window.close() to close this console tab.
 * 3. If the browser blocks close (tab not considered script-opened after
 *    URL was replaced by TenantAuthContext stripping `_s`), fall back to
 *    window.location.assign(fallbackHref) only for non-tenant paths.
 *    For tenant paths we do NOT navigate — the parent handles it, and
 *    navigating in this tab without session causes the login redirect bug.
 */
export function exitGuacamoleConsolePage(fallbackHref: string): void {
  if (typeof window === 'undefined') return;

  // Step 1 — tell the opener to navigate (parent has full auth context)
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(
        { type: CONSOLE_DISCONNECTED_MSG, href: fallbackHref },
        window.location.origin
      );
    } catch {
      // cross-origin opener — safe to ignore
    }
  }

  // Step 2 — close this tab
  window.close();

  // Step 3 — fallback: only navigate for non-tenant paths.
  // Tenant paths must NOT do a plain navigate — the tab has no session
  // after URL replacement, causing the /login redirect.
  const isTenantPath = fallbackHref.startsWith(TENANT_CONSOLE);
  if (!isTenantPath) {
    window.setTimeout(() => {
      if (typeof window.closed === 'boolean' && !window.closed) {
        window.location.assign(fallbackHref);
      }
    }, 150);
  }
  // For tenant paths: if window.close() failed, the tab stays open.
  // The parent tab has already navigated away via postMessage.
  // The console tab just stays showing the dark console screen — which
  // is acceptable. Users can close it manually.
}
