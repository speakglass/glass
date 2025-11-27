import { usePathname } from 'next/navigation';
import { DEFAULT_LANGUAGE } from '@/lib/supported-languages';

/**
 * Extract the current locale from the pathname
 * @returns The current locale (e.g., 'en', 'ko', 'ja')
 */
export function useLocale(): string {
  const pathname = usePathname();
  const lang = pathname.split('/')[1];
  return lang || DEFAULT_LANGUAGE;
}
