import { NextRequest, NextResponse } from 'next/server';
import { LOCALIZED_LANGUAGE_CODES, DEFAULT_LANGUAGE } from './lib/supported-languages';

const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

function isValidLocale(locale: string): boolean {
  return LOCALIZED_LANGUAGE_CODES.includes(locale as any);
}

function getPreferredLocale(request: NextRequest): string {
  // 1. Check if user has manually selected a language (stored in cookie)
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Auto-detect from browser's Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [locale, priority] = lang.trim().split(';q=');
      const localeCode = locale.split('-')[0]; // ko-KR -> ko
      const q = priority ? parseFloat(priority) : 1.0;
      return { locale: localeCode, q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { locale } of languages) {
    if (isValidLocale(locale)) {
      return locale;
    }
  }

  return DEFAULT_LANGUAGE;
}

function isAuthenticated(request: NextRequest): boolean {
  const sessionToken = request.cookies.get('authjs.session-token')?.value;
  return !!sessionToken;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for Next.js internal paths and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const pathnameLocale = pathname.split('/')[1];
  const pathWithoutLocale = pathname.split('/').slice(2).join('/');

  // Define auth pages (pages that don't require authentication)
  const authPages = ['login', 'signup', 'forgot-password', 'reset-password'];
  const isAuthPage = authPages.some((page) => pathWithoutLocale.startsWith(page));

  // Check authentication early
  const authenticated = isAuthenticated(request);

  // If URL doesn't have a valid locale, redirect to add one
  if (!isValidLocale(pathnameLocale)) {
    const preferredLocale = getPreferredLocale(request);
    // If not authenticated and trying to access a non-auth page, redirect to login
    if (!authenticated && !pathname.match(/\/(login|signup|forgot-password|reset-password)/)) {
      const loginUrl = new URL(`/${preferredLocale}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
    const newUrl = new URL(`/${preferredLocale}${pathname}`, request.url);
    return NextResponse.redirect(newUrl);
  }

  // Redirect unauthenticated users to login page
  if (!authenticated && !isAuthPage) {
    const loginUrl = new URL(`/${pathnameLocale}/login`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages to dashboard
  if (authenticated && isAuthPage) {
    const dashboardUrl = new URL(`/${pathnameLocale}/dashboard`, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Allow access
  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|images|video|fonts).*)'],
};
