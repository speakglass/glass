'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import {
  SUPPORTED_LANGUAGES,
  LOCALIZED_LANGUAGE_CODES,
} from '@/lib/supported-languages';
import { Globe } from 'lucide-react';
import { changeLanguage } from '@/utils/language';

export const LanguageSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState('en');
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Extract locale from pathname (e.g., /ko/page -> ko)
    const pathSegments = pathname.split('/').filter(Boolean);
    const locale = pathSegments[0];

    if (LOCALIZED_LANGUAGE_CODES.includes(locale as any)) {
      setCurrentLocale(locale);
    }
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLanguageChange = (locale: string) => {
    const newPath = changeLanguage(locale, pathname, LOCALIZED_LANGUAGE_CODES);
    window.location.href = newPath;
    setIsOpen(false);
  };

  const currentLanguage =
    SUPPORTED_LANGUAGES[currentLocale as keyof typeof SUPPORTED_LANGUAGES];

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        size="icon"
        aria-label="Change language"
        className="rounded-full w-9 sm:w-auto sm:px-3"
      >
        <Globe className="size-4" />
        <span className="hidden sm:inline ml-2">
          {currentLanguage?.native_name || 'English'}
        </span>
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border bg-popover shadow-lg z-50">
          <div className="py-1">
            {LOCALIZED_LANGUAGE_CODES.map((locale) => {
              const language = SUPPORTED_LANGUAGES[locale];
              const isActive = locale === currentLocale;

              return (
                <button
                  key={locale}
                  onClick={() => handleLanguageChange(locale)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                    isActive ? 'bg-accent font-medium' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{language.native_name}</span>
                    {isActive && <span className="text-primary">✓</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {language.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
