import { NextRequest, NextResponse } from 'next/server';
import { LOCALIZED_LANGUAGE_CODES, DEFAULT_LANGUAGE } from './lib/supported-languages';

// ============================================================================
// Types & Constants
// ============================================================================

type UtmParamKey = 'utm_source' | 'utm_campaign' | 'utm_content';
type UtmParams = Partial<Record<UtmParamKey, string>>;

const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
const UTM_COOKIE_NAME = 'glass:first-touch-utm';
const UTM_PARAM_KEYS: readonly UtmParamKey[] = ['utm_source', 'utm_campaign', 'utm_content'];

/**
 * Pages that don't require authentication.
 * These pages are accessible to both authenticated and unauthenticated users.
 */
const PUBLIC_AUTH_PAGES = ['login', 'signup', 'forgot-password', 'reset-password'] as const;

/**
 * Post-signup verification pages that require special handling.
 * These pages are accessible after signup but before full authentication.
 */
const VERIFICATION_PAGES = ['verify-email', 'verify-email-sent'] as const;

/**
 * All authentication-related pages (public + verification).
 */
const ALL_AUTH_PAGES = [...PUBLIC_AUTH_PAGES, ...VERIFICATION_PAGES] as const;

/**
 * Authentication pages that should redirect to dashboard when user is authenticated.
 * Excludes verification pages which are part of the signup flow.
 */
const REDIRECT_WHEN_AUTHENTICATED = PUBLIC_AUTH_PAGES;

// ============================================================================
// Locale Management
// ============================================================================

function isValidLocale(locale: string): boolean {
  return LOCALIZED_LANGUAGE_CODES.includes(locale as any);
}

function getPreferredLocale(request: NextRequest): string {
  // 1. Check for manually selected language in cookie
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Auto-detect from browser's Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) {
    return DEFAULT_LANGUAGE;
  }

  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [locale, priority] = lang.trim().split(';q=');
      const localeCode = locale.split('-')[0]; // Extract primary language code (e.g., 'ko' from 'ko-KR')
      const q = priority ? parseFloat(priority) : 1.0;
      return { locale: localeCode, q };
    })
    .sort((a, b) => b.q - a.q); // Sort by priority (highest first)

  // Find first supported locale
  for (const { locale } of languages) {
    if (isValidLocale(locale)) {
      return locale;
    }
  }

  return DEFAULT_LANGUAGE;
}

// ============================================================================
// Authentication Helpers
// ============================================================================

function isAuthenticated(request: NextRequest): boolean {
  return !!request.cookies.get('authjs.session-token')?.value;
}

function isPublicAuthPage(path: string): boolean {
  return PUBLIC_AUTH_PAGES.some((page) => path.startsWith(page));
}

function isVerificationPage(path: string): boolean {
  return VERIFICATION_PAGES.some((page) => path.startsWith(page));
}

function isAnyAuthPage(path: string): boolean {
  return ALL_AUTH_PAGES.some((page) => path.startsWith(page));
}

function shouldRedirectToDashboard(path: string): boolean {
  return REDIRECT_WHEN_AUTHENTICATED.some((page) => path.startsWith(page));
}

// ============================================================================
// UTM Tracking
// ============================================================================

function sanitizeUtmValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 255); // Prevent excessively long values
}

function extractUtmParams(request: NextRequest): UtmParams {
  const params: UtmParams = {};
  for (const key of UTM_PARAM_KEYS) {
    const value = sanitizeUtmValue(request.nextUrl.searchParams.get(key));
    if (value) {
      params[key] = value;
    }
  }
  return params;
}

function hasAnyUtmParam(params: UtmParams): boolean {
  return UTM_PARAM_KEYS.some((key) => Boolean(params[key]));
}

function captureFirstTouchUtm(request: NextRequest, response: NextResponse): void {
  // Only capture if no existing UTM cookie
  if (request.cookies.get(UTM_COOKIE_NAME)?.value) {
    return;
  }

  const utmParams = extractUtmParams(request);
  if (!hasAnyUtmParam(utmParams)) {
    return;
  }

  // Store UTM parameters in a cookie for 1 year
  response.cookies.set({
    name: UTM_COOKIE_NAME,
    value: JSON.stringify(utmParams),
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

// ============================================================================
// Redirect Logic
// ============================================================================

/**
 * Builds a redirect URL while preserving query parameters (including UTM).
 */
function buildRedirectUrl(request: NextRequest, pathname: string): URL {
  const originalUrl = new URL(request.url);
  return new URL(pathname + originalUrl.search, originalUrl.origin);
}

/**
 * Creates a redirect response and captures UTM parameters.
 */
function redirect(request: NextRequest, pathname: string): NextResponse {
  const url = buildRedirectUrl(request, pathname);
  const response = NextResponse.redirect(url);
  captureFirstTouchUtm(request, response);
  return response;
}

/**
 * Determines the appropriate redirect path based on authentication state and current path.
 * Returns null if no redirect is needed.
 */
function getRedirectPath(authenticated: boolean, locale: string, pathWithoutLocale: string): string | null {
  // Case 1: Authenticated users trying to access login/signup pages
  //         → Redirect to dashboard (but allow verification pages)
  if (authenticated && shouldRedirectToDashboard(pathWithoutLocale)) {
    return `/${locale}/dashboard`;
  }

  // Case 2: Unauthenticated users trying to access protected pages
  //         → Redirect to login
  if (!authenticated && !isAnyAuthPage(pathWithoutLocale)) {
    return `/${locale}/login`;
  }

  // Case 3: No redirect needed
  return null;
}

// ============================================================================
// Main Proxy Handler
// ============================================================================

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Skip proxy for Next.js internal paths and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('/favicon.ico') ||
    pathname.includes('.') // Static files (e.g., .js, .css, .png)
  ) {
    return NextResponse.next();
  }

  // Extract locale and path
  const segments = pathname.split('/').filter(Boolean);
  const pathnameLocale = segments[0] || '';
  const pathWithoutLocale = segments.slice(1).join('/');
  const authenticated = isAuthenticated(request);

  // ============================================================================
  // Step 1: Handle missing or invalid locale
  // ============================================================================
  if (!isValidLocale(pathnameLocale)) {
    const preferredLocale = getPreferredLocale(request);

    // Determine target path based on authentication state
    const targetPath =
      !authenticated && !isAnyAuthPage(pathWithoutLocale)
        ? `/${preferredLocale}/login`
        : `/${preferredLocale}${pathname}`;

    return redirect(request, targetPath);
  }

  // ============================================================================
  // Step 2: Check if redirect is needed based on authentication state
  // ============================================================================
  const redirectPath = getRedirectPath(authenticated, pathnameLocale, pathWithoutLocale);
  if (redirectPath) {
    return redirect(request, redirectPath);
  }

  // ============================================================================
  // Step 3: Allow access and capture UTM if present
  // ============================================================================
  const response = NextResponse.next();
  captureFirstTouchUtm(request, response);
  response.headers.set('x-pathname', pathname);
  return response;
}

/**
 * Matcher configuration for Next.js proxy.
 * Excludes API routes, static files, and Next.js internal paths.
 */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|images|video|fonts).*)'],
};
