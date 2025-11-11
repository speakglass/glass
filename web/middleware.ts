import { NextRequest, NextResponse } from 'next/server';
import {
  LOCALIZED_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
} from './lib/supported-languages';

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

export function middleware(request: NextRequest) {
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

  // If URL already has a valid locale, proceed
  if (isValidLocale(pathnameLocale)) {
    return NextResponse.next();
  }

  // Auto-detect preferred locale from browser settings
  const preferredLocale = getPreferredLocale(request);
  const newUrl = new URL(`/${preferredLocale}${pathname}`, request.url);

  // Redirect to localized URL
  return NextResponse.redirect(newUrl);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|images|video|fonts).*)',
  ],
};
