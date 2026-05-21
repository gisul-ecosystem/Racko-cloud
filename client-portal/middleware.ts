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
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check session via refreshToken cookie presence
  const hasSession = request.cookies.has('refreshToken');

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based protection for super-admin routes
    // Note: full role check happens in the page via AuthContext
    // Middleware only checks session existence for performance
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/register',
  ],
};
