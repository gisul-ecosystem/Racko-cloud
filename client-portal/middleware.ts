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

  // Only allow known app areas (path + optional query/hash).
  if (
    !value.startsWith('/console') &&
    !value.startsWith('/dashboard') &&
    !value.startsWith('/super-admin-console') &&
    !value.startsWith('/tenant') &&
    value !== '/request' &&
    !value.startsWith('/status/')
  ) {
    return null;
  }

  return value;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Check session via refreshToken cookie presence
  const hasSession = request.cookies.has('refreshToken');

  // Protect console, dashboard, and request builder routes
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/console') ||
    pathname === '/request' ||
    pathname.startsWith('/status/')
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
    '/request',
    '/status/:path*',
    '/login',
    '/register',
  ],
};
