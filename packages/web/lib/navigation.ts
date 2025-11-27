/**
 * Client-side navigation utilities
 * 
 * Provides consistent navigation methods across the application.
 * Prefer these utilities over direct window.location manipulation.
 */

/**
 * Navigate to a path within the current locale
 * @param path - The path to navigate to (e.g., '/dashboard', '/login')
 * @param locale - The locale to use (e.g., 'en', 'ko')
 */
export function navigateToPath(path: string, locale: string): void {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  window.location.href = `/${locale}${cleanPath}`;
}

/**
 * Navigate to an absolute URL
 * @param url - The full URL to navigate to
 */
export function navigateToUrl(url: string): void {
  window.location.href = url;
}

/**
 * Reload the current page
 */
export function reloadPage(): void {
  window.location.reload();
}

/**
 * Get the current locale from the pathname
 * @returns The current locale (e.g., 'en', 'ko') or null if not found
 */
export function getCurrentLocale(): string | null {
  if (typeof window === 'undefined') return null;
  const pathParts = window.location.pathname.split('/');
  return pathParts[1] || null;
}

