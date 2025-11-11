export type SupportedLanguage = {
  name: string;
  native_name: string;
  region: string;
  label: string;
};

export const SUPPORTED_LANGUAGES = {
  en: {
    name: 'English',
    native_name: 'English',
    region: 'Popular',
    label: 'English (English)',
  },
  ja: {
    name: 'Japanese',
    native_name: '日本語',
    region: 'Popular',
    label: '日本語 (Japanese)',
  },
  zh: {
    name: 'Chinese',
    native_name: '中文',
    region: 'Popular',
    label: '中文 (Chinese)',
  },
  es: {
    name: 'Spanish',
    native_name: 'Español',
    region: 'Popular',
    label: 'Español (Spanish)',
  },
  fr: {
    name: 'French',
    native_name: 'Français',
    region: 'Popular',
    label: 'Français (French)',
  },
  ko: {
    name: 'Korean',
    native_name: '한국어',
    region: 'Popular',
    label: '한국어 (Korean)',
  },
} as const;

export const LOCALIZED_LANGUAGE_CODES = [
  'en',
  'ja',
  'ko',
  'zh',
  'es',
  'fr',
] as const;
export type LOCALES = (typeof LOCALIZED_LANGUAGE_CODES)[number];
export const DEFAULT_LANGUAGE = 'en';
