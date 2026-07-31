import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js middleware for route protection.
 * Checks for refreshToken cookie as session indicator.
 * Access token is in memory — middleware uses cookie presence as proxy.
 *
 * Protected: /dashboard/*
 * Auth routes: /login, /register (redirect to dashboard if session exists)
 */
function isTenantWorkspacePath(pathname: string): boolean {
  return (
    pathname === '/console/login' ||
    pathname === '/console/forgot-password' ||
    pathname === '/console/reset-password' ||
    pathname.startsWith('/console/dashboard')
  );
}

/** Map legacy /tenant/* URLs to /console/* equivalents. */
function mapLegacyTenantPath(pathname: string): string | null {
  if (pathname === '/tenant' || pathname === '/tenant/') {
    return '/console/dashboard';
  }
  if (pathname === '/tenant/login' || pathname.startsWith('/tenant/login/')) {
    return '/console/login';
  }
  if (pathname === '/tenant/forgot-password' || pathname.startsWith('/tenant/forgot-password/')) {
    return '/console/forgot-password';
  }
  if (pathname === '/tenant/reset-password' || pathname.startsWith('/tenant/reset-password')) {
    return `/console/reset-password${pathname.slice('/tenant/reset-password'.length)}`;
  }
  if (pathname === '/tenant/console' || pathname.startsWith('/tenant/console/')) {
    return `/console/dashboard${pathname.slice('/tenant/console'.length)}`;
  }
  if (pathname === '/tenant/dashboard' || pathname.startsWith('/tenant/dashboard/')) {
    return `/console/dashboard${pathname.slice('/tenant/dashboard'.length)}`;
  }
  if (pathname.startsWith('/tenant/')) {
    return `/console${pathname.slice('/tenant'.length)}`;
  }
  return null;
}

function getSafeInternalRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }

  // Rewrite legacy tenant redirects before allow-list check.
  const mapped = mapLegacyTenantPath(value.split('?')[0] ?? value);
  if (mapped) {
    const qIndex = value.indexOf('?');
    value = qIndex >= 0 ? `${mapped}${value.slice(qIndex)}` : mapped;
  }

  // Only allow known app areas (path + optional query/hash).
  if (
    !value.startsWith('/console') &&
    !value.startsWith('/dashboard') &&
    !value.startsWith('/super-admin-console') &&
    !value.startsWith('/onboarding') &&
    value !== '/request' &&
    !value.startsWith('/status/')
  ) {
    return null;
  }

  return value;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const legacy = mapLegacyTenantPath(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url);
  }

  // Check session via refreshToken cookie presence
  const hasSession = request.cookies.has('refreshToken');

  // Protect console, dashboard, and request builder routes.
  // Tenant workspace under /console/{login,forgot-password,reset-password,dashboard} uses tenant JWT.
  if (
    (pathname.startsWith('/dashboard') ||
      pathname.startsWith('/console') ||
      pathname === '/request' ||
      pathname.startsWith('/status/')) &&
    !isTenantWorkspacePath(pathname)
  ) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      // Keep query string (e.g. fromTestRequest + purchaseToken) across login.
      loginUrl.searchParams.set('redirect', `${pathname}${search || ''}`);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based protection for super-admin routes
    // Note: full role check happens in the page via AuthContext
    // Middleware only checks session existence for performance
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    const redirect = getSafeInternalRedirect(request.nextUrl.searchParams.get('redirect'));
    return NextResponse.redirect(new URL(redirect || '/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/console',
    '/console/:path*',
    '/tenant',
    '/tenant/:path*',
    '/request',
    '/status/:path*',
    '/login',
    '/register',
    '/onboarding/:path*',
  ],
};
