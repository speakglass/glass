/**
 * Centralized language management utilities
 * Handles language preference storage and retrieval
 */

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
const COOKIE_MAX_AGE = 31536000; // 1 year in seconds

/**
 * Save user's language preference to cookie
 */
export function saveLanguagePreference(locale: string): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Get user's saved language preference from cookie
 */
export function getSavedLanguagePreference(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === LOCALE_COOKIE_NAME) {
      return value;
    }
  }
  return null;
}

/**
 * Clear saved language preference
 */
export function clearLanguagePreference(): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${LOCALE_COOKIE_NAME}=; path=/; max-age=0`;
}

/**
 * Change language and save preference
 * Returns the new URL to navigate to
 */
export function changeLanguage(
  locale: string,
  currentPathname: string,
  validLocales: readonly string[]
): string {
  // Save preference
  saveLanguagePreference(locale);

  // Build new path
  const pathSegments = currentPathname.split('/').filter(Boolean);
  const currentLocaleInPath = pathSegments[0];

  let newPath;
  if (validLocales.includes(currentLocaleInPath as any)) {
    // Replace existing locale
    pathSegments[0] = locale;
    newPath = `/${pathSegments.join('/')}`;
  } else {
    // Add locale prefix
    newPath = `/${locale}${currentPathname}`;
  }

  return newPath;
}
